import ordinal from 'ordinal'

/**
 * Transaction class
 *
 * @param {Array<Function>} steps
 */
export default class Transaction {
  constructor (steps) {
    if (!Array.isArray(steps)) {
      throw new Error(`Expected a list of functions, got ${JSON.stringify(steps)}`)
    }
    if (steps.length <= 0) {
      throw new Error('A transaction needs at least one step')
    }
    steps.forEach((step, i) => {
      if (typeof step !== 'function') {
        throw new Error(`${ordinal(i + 1)} Transaction step is not a function`)
      }
    })

    this.steps = steps
    this.callbacks = {
      onSpecificErrors: []
    }
  }

  /**
   * execute starts executing the steps in order, waiting for the returned Promises to resolve before continuing to the next step
   *
   * @param {Object} context
   * @api public
   */
  execute (context = {}) {
    if (!this.callbacks.onError) {
      throw new Error('You called `execute` before assigning an `onError` callback. This means that errors in steps will be silenced. Add an `onError` callback before calling `execute`.')
    }
    if (this.currentStep >= 0) {
      throw new Error('Transaction is already in progress. To resume the transaction, use the `resume` method instead of `execute`')
    }
    this.context = context
    this.runNextStep()
  }

  /**
   * onSuccess registers a callback which will be called when the last step completes successfully
   *
   * @param {Function} callback
   * @api public
   */
  onSuccess (callback) {
    this.callbacks.onSuccess = callback
  }

  /**
   * then registers a callback which will be called when the last step completes successfully
   *
   * @param {Function} callback
   * @api public
   */
  then (callback) {
    this.onSuccess(callback)
  }

  /**
   * onResume registers a callback which will be called each time the transaction is resumed
   *
   * @param {Function} callback
   * @api public
   */
  onResume (callback) {
    this.callbacks.onResume = callback
  }

  /**
   * onError registers a callback which will be called when there is an error executing any step
   *
   * @param {Function} callback
   * @api public
   */
  onError (callback) {
    this.callbacks.onError = callback
  }

  /**
   * onSpecificError regiesters a callback which will be called when there is an error that matches the message
   *
   * @param {string|RegExp} error
   * @param {Function} callback
   * @api public
   */
  onSpecificError (error, callback) {
    const pattern = error instanceof RegExp ? error : new RegExp(`^${error}$`)
    this.callbacks.onSpecificErrors.push({ callback, pattern })
  }

  /**
   * resume continues execution starting with the current step
   *
   * @param {string} suppressWarning // use this in tests (**only in tests**) to suppress the synchronous resolve warning. It must be set to 'Yes this is in test code' to suppress the warning
   * @api public
   */
  resume (suppressWarning) {
    if (this.resumedBeforeNextTick && suppressWarning !== 'Yes this is in test code') {
      const warning = 'You called `resolve` synchronously in an onError callback, which could produce an infinite loop. ' +
        'You should probably get user input before resuming the transaction -- or if you intend to restart it automatically, you should implement that inside of the Transaction class as an auto-retry param. ' +
        'If you do, only show this warning if auto-retry is not set to true.'
      console.warn(warning)
      throw new Error(warning)
    }
    this.callbacks.onResume && this.callbacks.onResume()
    this.currentStep -= 1
    this.runNextStep()
  }

  /**
   * run the next step
   *
   * @api private
   */
  runNextStep () {
    const nextStep = this.getNextStep()
    if (!nextStep) {
      this.afterTransactionIsComplete()
    } else {
      const promise = nextStep(this.context)
      if (!promise || !promise.then) {
        this.handleStepError(new Error('it didn\'t return a Promise. Instead, it returned ' + JSON.stringify(promise)))
      } else {
        promise
          .then(newContext => this.handleStepSuccess(newContext))
          .catch(error => this.handleStepError(error))
      }
    }
  }

  /**
   * getNextStep increments the step counter and returns the next one
   *
   * @return {Function|undefined}
   * @api private
   */
  getNextStep () {
    this.currentStep = typeof this.currentStep !== 'number' ? 0 : this.currentStep + 1
    return this.steps[this.currentStep]
  }

  /**
   * handleStepSuccess calls runNextStep after updating context
   *
   * @param {Object|undefined} newContext
   * @api private
   */
  handleStepSuccess (newContext) {
    newContext = typeof newContext === 'object' ? newContext : {}
    this.context = Object.assign({}, this.context, newContext)
    this.runNextStep()
  }

  /**
   * transaction is complete, cleanup
   *
   * @api private
   */
  afterTransactionIsComplete () {
    this.callbacks.onSuccess && this.callbacks.onSuccess()
  }

  /**
   * one transaction step failed: handle the error
   *
   * @param {Error} error
   * @api private
   */
  handleStepError (error) {
    const errorCallback = this.findErrorCallback(error.message)
    error.message = `Error in ${this.currentStepText()}: ${error.message}`
    this.resumedBeforeNextTick = true
    errorCallback(error)
    this.resumedBeforeNextTick = false
  }

  /**
   * findErrorCallback returns a specific error callback if present, otherwise the onError callback
   *
   * @param {string} errorMessage
   * @return {Function}
   * @api private
   */
  findErrorCallback (errorMessage) {
    const errorCallbacks = []
    this.callbacks.onSpecificErrors.forEach(({ callback, pattern }) => {
      if (errorMessage.match(pattern)) {
        errorCallbacks.push(callback)
      }
    })

    return errorCallbacks.length
      ? (...args) => errorCallbacks.map(errorCallback => errorCallback(...args))
      : this.callbacks.onError
  }

  /**
   * currentStepText returns a text representation of the current step
   *
   * @return {string}
   * @api private
   */
  currentStepText () {
    return this.currentStep >= this.steps.length ? 'onSuccess callback' : ordinal(this.currentStep + 1) + ' step'
  }
}
