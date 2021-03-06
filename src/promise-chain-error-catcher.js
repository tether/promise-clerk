/**
 * PromiseChainErrorCatcher can be used to collect and then summarize errors.
 *   It is designed to simplify debugging complex Promise chains
 *
 * @api public
 */
export default class PromiseChainErrorCatcher {
  constructor (callingEntityName) {
    this.callingEntityName = callingEntityName
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

  handleFinalError () {
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
    let errorMessage = `${this.callingEntityName} has failed.\n`
    this.results.forEach((oneError, index) => {
      if (oneError.tag) {
        const filter = this.errorFilters[oneError.tag]
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
