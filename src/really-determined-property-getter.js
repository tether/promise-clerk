import PromiseChainErrorCatcher from './promise-chain-error-catcher'
import assertIsPromise from './assert-is-promise'
import Quitter from './quitter'

export default class ReallyDeterminedPropertyGetter {
  constructor () {
    this.configuration = {
      secondarySources: [],
      primarySourceSynchronizers: []
    }
    this.verifyValue = this.verifyValue.bind(this)
  }

  /**
   * Register a primary source. Required, and may only be called once
   *
   * @param {Function} getter
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */
  primarySource (getter) {
    if (this.configuration.primarySource) throw new Error('There can only be one primary source. You already registered this primary source:\n' + this.configuration.primarySource.toString())
    this.configuration.primarySource = getter
    return this
  }

  /**
   * Register a secondary source. Optional, and may be called multiple times.
   *
   * @param {Function} getter
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */
  secondarySource (getter) {
    this.configuration.secondarySources.push(getter)
    return this
  }

  /**
   * Register a verification method to determine if a resolved value is acceptable
   *
   * @param {(value: any) => boolean} verifier
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */
  verify (verifier) {
    if (this.configuration.verifier) throw new Error('There can only be one verifier function. You already registered this verifier function:\n' + this.configuration.verifier.toString())
    this.configuration.verifier = verifier
    return this
  }

  /**
   * Register a primarySourceSynchronizer function which will be called if there is a data integrity problem to resolve
   *   - it is called if:
   *      1. the primary source fails (Promise rejects or value fails verification), AND
   *      2. one secondary source succeeded (Promise resolves and value passes verification)
   *
   * @param {(value: any) => Promise} primarySourceSynchronizer
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */
  synchronizeWithPrimarySource (primarySourceSynchronizer) {
    this.configuration.primarySourceSynchronizers.push(primarySourceSynchronizer)
    return this
  }

  /**
   * Sets a flag indicating that if a synchronization function fails, the main promise should not reject
   *
   * @return {ReallyDeterminedPropertyGetter}
   * @api public
   */
  ignoreSynchronizationErrors () {
    this.configuration.ignoreSynchronizationErrors = true
    return this
  }

  /**
   * Returns a Promise which will be resolved or rejected reflecting the result of all the sources
   *  - Tries the primary source followed by secondary sources in the order they were added
   *  - Calls all primarySourceSynchronizers with the successfully retrieved value
   *  - Resolves with the first successfully retrieved value
   *  - Rejects with the rejection messages of all sources if no sources' values were acceptable
   *
   * @return {any}
   * @api public
   */
  get () {
    if (this.getInProgress) throw new Error('`get` was called again before the first call to `get` completed. This will produce unexpected behavior and is not allowed.')
    if (!this.configuration.primarySource) throw new Error('Cannot get value without a primary source. Use `.primarySource(() => primarySourcePromise)`')

    const errorCatcher = new PromiseChainErrorCatcher('The Really Determined Property Getter')
    const quitter = new Quitter()
    this.getInProgress = true

    return assertIsPromise(this.configuration.primarySource())
      .then(this.verifyValue)
      .catch(errorCatcher.nameError('primary source'))
      .catch(primaryError => this.getFromSecondaries(errorCatcher, quitter, primaryError))
      .then(value => { this.getInProgress = false; return value })
      .catch(error => { this.getInProgress = false; throw error })
      .catch(errorCatcher.handleFinalError())
  }

  /**
   * getFromSecondaries attempts to get the value from each of the secondary sources in order
   *
   * @param {PromiseChainErrorCatcher} errorCatcher
   * @param {Quitter} quitter
   * @param {Error} primaryError
   * @return {Promise}
   * @api private
   */
  getFromSecondaries (errorCatcher, quitter, primaryError) {
    let secondaryPromise = Promise.reject(primaryError)
    this.configuration.secondarySources.forEach((secondarySource, index) => {
      const name = 'secondary source #' + (index + 1)
      secondaryPromise = secondaryPromise
        .catch(secondaryError => {
          quitter.maybeQuit(secondaryError)
          errorCatcher.push(secondaryError)
          return assertIsPromise(secondarySource(), 'secondarySource')
            .then(this.verifyValue)
            .catch(errorCatcher.nameError(name))
            .then(errorCatcher.recordSuccess(name))
            .then(value => this.performSynchronizationWithPrimary(errorCatcher, quitter, value))
        })
    })
    return secondaryPromise
  }

  /**
   * performSynchronizationWithPrimary synchronizes the found value with the primary source
   *
   * @param {PromiseChainErrorCatcher} errorCatcher
   * @param {Quitter} quitter
   * @param {Object} value
   * @return {Promise}
   * @api private
   */
  performSynchronizationWithPrimary (errorCatcher, quitter, value) {
    let syncPromise = Promise.resolve(value)
    this.configuration.primarySourceSynchronizers.forEach((primarySourceSynchronizer, index) => {
      const name = 'primarySourceSynchronizer function #' + (index + 1)
      syncPromise = syncPromise
        .then(() => assertIsPromise(primarySourceSynchronizer(value)))
        .catch(errorCatcher.nameError(name))
        .catch(quitter.quitOnCondition(!this.configuration.ignoreSynchronizationErrors))
        .then(() => value)
    })
    return syncPromise
  }

  /**
   * verifyValue throws if the value is not accepted by the `verifier`, otherwise it returns the value
   *  if `this.configuration.verifier(value)` returns truthy, the value is considered acceptable
   *  if there is no verifier function, the value is considered acceptable
   *
   * @param {any} value
   * @return {any}
   * @api private
   */
  verifyValue (value) {
    if (this.configuration.verifier && !this.configuration.verifier(value)) {
      throw new Error(`the verifier function did not accept the value ${JSON.stringify(value)}`)
    } else {
      return value
    }
  }
}
