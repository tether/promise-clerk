/**
 * PromiseChainErrorSummarizer can be used to collect and then summarize errors.
 *   It is designed to simplify debugging complex Promise chains
 *
 * @api public
 */
export class PromiseChainErrorSummarizer {
  constructor () {
    this.results = []
    this.catchError = this.catchError.bind(this)
  }

  /**
   * append another error
   */
  push (result) {
    this.results.push(result)
  }

  recordSuccess (name) {
    return value => {
      this.push({ success: true, stepName: name, toString: () => JSON.stringify(value) })
      return value
    }
  }

  /**
   * catchError can be passed directly to a `catch` block to catch and push an error
   *
   *   Promise.reject(new Error('bad stuff'))
   *     .catch(yourErrorSummarizer.catchError)
   *
   * @param {Error} error
   * @api public
   */
  catchError (error) {
    this.push(error)
  }

  nameError (name) {
    return function nameError (error) {
      error.stepName = error.stepName || name
      throw error
    }
  }

  handleFinalError (resultsObject) {
    return finalError => {
      this.push(finalError)
      throw this.reportError()
    }
  }

  /**
   * reportError returns a summary of all the errors that it has been notified of
   *
   * @return {Error}
   * @api public
   */
  reportError (errorFilters) {
    let errorMessage = 'The Really Determined Property Getter has failed.\n'
    this.results.forEach((oneError, index) => {
      if(oneError.tag) {
        filter = this.errorFilters[oneError.tag]
        filter && filter(oneError)
      }
      const stepName = oneError.stepName
      errorMessage += `  - ${stepName} `
      errorMessage += oneError.success ? `resolved with ${oneError.toString()}` : `failed because ${oneError.message}`
      errorMessage += '\n'
    })
    return new Error(errorMessage)
  }
}

/**
 * assertIsPromise returns a Promise -- if the argument is a Promise, it is returned. Otherwise, a rejected Promise is returned explaining that the argument wasn't a Promise
 *
 * @param {Promise|any} maybeAPromise
 * @return {Promise}
 * @api public
 */
export function assertIsPromise (maybeAPromise) {
  if(maybeAPromise && maybeAPromise.then) {
    return maybeAPromise.catch(error => {
      error.message = `it was rejected with '${error.toString()}'`
      throw error
    })
  } else {
    return Promise.reject(new Error(`it was expected to return a Promise, but instead it returned ${JSON.stringify(maybeAPromise)}`))
  }
}

/**
 * Quitter is a convenient way to keep track of whether a Promise chain should be aborted or not
 * 
 * @api public
 */
export class Quitter {
  /**
   * if `quit()` has been called, then throw the error. Otherwise, do nothing
   *
   * @param {Error} error
   * @api public
   */
  maybeQuit (error) {
    if(this.doQuit) throw error
  }

  /**
   * indicate that the next time `maybeQuit` is called, the quitter should quit (throw error) instead of doing nothing
   *   Returns a function which can be attached to a Promise catch block
   *
   * @return {Function} 
   * @api public
   */
  quit () {
    return (error) => {
      this.doQuit = true
      throw error
    }
  }

  quitOnCondition (condition) {
    return condition ? this.quit() : () => {}
  }
}
