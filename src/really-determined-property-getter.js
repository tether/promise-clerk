import PromiseChainErrorCatcher from './promise-chain-error-catcher'
import assertIsPromise from './assert-is-promise'
import Quitter from './quitter'

/**
 * ReallyDeterminedPropertyGetter provides a way to define an external value (e.g. accessible via some API)
 *   with one or more secondary data sources to fall back to in case the primary one is unavailable
 *
 *    const movieListing = await new ReallyDeterminedPropertyGetter()
 *      .verify(movies => movies.length === movieTitles.length)
 *      .primarySource(() => mainAPI.getMovieListingsPromise(movieTitles))
 *      .secondarySource(() => Promise.all(movieTitles.map(title => otherAPI.getMovie(title))))
 *      .secondarySource(() => new Promise((resolve, reject) =>
 *        oldSchoolHttpGet('https://movies.com?titles=' + movieTitles,join(','), (err, results) => err ? reject(err) : resolve(results))
 *      ))
 *      .synchronizeWithPrimarySource(movies => mainAPI.updateMovieListings(movies))
 *      .ignoreSynchronizationErrors() // Only if you don't care whether mainApi.updateMovieListings() succeeds or fails
 *      .get()
 *
 *  The basic algorithm is:
 *    - if no `verify` method is provided, consider all values verified. Otherwise, a value is considered verified if the `verify` method returns true when provided the value
 *    - try getting the value from a primary source, return it if found and verified
 *    - try getting value from a secondary source, return it if found and verified
 *    - repeat until the value is found and verified or we're out of sources
 *
 *  Available methods are:
 *    - primarySource(getter: Function<Promise>)         // Required, may only be called once. Register a primary source
 *    - secondarySource(getter: Function<Promise>)       // Optional, may be called any number of times. Register a secondary source (will be attempted in the order added)
 *    - verify(verify: (value) => boolean)               // Optional, may only be called once. Will be called for each found value. Values for which `verify` returns false will be ignored
 *    - synchronizeWithPrimarySource((value) => Promise) // Optional, may be called any number of times. Registers a callback which is called if the primary source fails but a secondary source succeeds
 *    - ignoreSynchronizationErrors()                    // Optional. If it has been called, then any errors produced by a primarySourceSynchronizer function are ignored instead of causing the main `get` method to reject
 *    - get()                                            // Returns a Promise which resolves with the result, if available. May be called repeatedly as long as the returned Promise resolves before calling `get` again
 *
 * Note: this class uses the Builder Pattern (read more: https://en.wikipedia.org/wiki/Builder_pattern) to avoid having a long list of constructor arguments,
 *  some being optional, others required, etc..
 *
 */
export default class ReallyDeterminedPropertyGetter {
  constructor () {
    this.configuration = {
      secondarySources: [],
      primarySourceSynchronizers: []
    }
    this.getterState = {}
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
    if (this.getterState.inProgress) throw new Error('`get` was called again before the first call to `get` completed. This will produce unexpected behavior and is not allowed.')
    if (!this.configuration.primarySource) throw new Error('Cannot get value without a primary source. Use `.primarySource(() => primarySourcePromise)`')
    this.resetState()

    return assertIsPromise(this.configuration.primarySource())
      .then(this.verifyValue)
      .catch(this.getterState.results.nameError('primary source'))
      .catch(primaryError => {
        let secondaryPromise = Promise.reject(primaryError)

        this.configuration.secondarySources.forEach((secondarySource, index) => {
          const name = 'secondary source #' + (index + 1)
          secondaryPromise = secondaryPromise
            .catch(secondaryError => {
              this.getterState.quitter.maybeQuit(secondaryError)
              this.getterState.results.push(secondaryError)
              let newPromise = assertIsPromise(secondarySource(), 'secondarySource')
                .then(this.verifyValue)
                .catch(this.getterState.results.nameError(name))
                .then(this.getterState.results.recordSuccess(name))

              this.configuration.primarySourceSynchronizers.forEach((primarySourceSynchronizer, index) => {
                const name = 'primarySourceSynchronizer function #' + (index + 1)
                newPromise = newPromise.then(value => {
                  return Promise.resolve()
                    .then(() => assertIsPromise(primarySourceSynchronizer(value)))
                    .catch(this.getterState.results.nameError(name))
                    .catch(this.getterState.quitter.quitOnCondition(!this.configuration.ignoreSynchronizationErrors))
                    .then(() => value)
                })
              })

              return newPromise
            })
        })
        return secondaryPromise
      })
      .then(value => { this.getterState.inProgress = false; return value })
      .catch(error => { this.getterState.inProgress = false; throw error })
      .catch(this.getterState.results.handleFinalError())
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

  /**
   * initialize/reset all state related to executing the `get` method
   *
   * @api private
   */
  resetState () {
    this.getterState = {
      quitter: new Quitter(),
      inProgress: true,
      currentSecondarySource: 0,
      results: new PromiseChainErrorCatcher()
    }
  }
}
