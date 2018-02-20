import PromiseChainErrorCatcher from '../src/promise-chain-error-catcher'

describe('PromiseChainErrorCatcher', () => {
  function riskyFooBar () {
    return Promise.reject(new Error('<error message from riskyFooBar>'))
  }

  function riskyQuux () {
    return Promise.resolve('<value from riskyQuux>')
  }

  function doNotCareIfThisFailsOrSucceeds () {
    return Promise.reject(new Error('<error message from doNotCareIfThisFailsOrSucceeds>'))
  }

  function doSomethingThatFails () {
    return Promise.reject(new Error('<error message from doSomethingThatFails>'))
  }

  it('produces reasonable error summaries', () => {
    const errorCatcher = new PromiseChainErrorCatcher('<The Calling Entity Name>')

    const promiseUnderTest = riskyFooBar()
      .catch(errorCatcher.nameError('Foo Bar step'))
      .catch(error => {
        errorCatcher.push(error)
        return riskyQuux()
          .then(errorCatcher.recordSuccess('Quux step'))
          .catch(errorCatcher.nameError('Quux step'))
      })
      .then(value => {
        return doNotCareIfThisFailsOrSucceeds()
          .catch(errorCatcher.nameError('Unimportant step'))
          .catch(errorCatcher.catchError)
          .then(() => doSomethingThatFails())
          .catch(errorCatcher.nameError('Failing step'))
      })
      .catch(errorCatcher.handleFinalError())

    return promiseUnderTest
      .then(value => fail('expected to reject, but resolved with ' + JSON.stringify(value)))
      .catch(error => {
        let expectedMessage = '<The Calling Entity Name> has failed.\n' +
          '  - Foo Bar step failed because <error message from riskyFooBar>\n' +
          '  - Quux step resolved with "<value from riskyQuux>"\n' +
          '  - Unimportant step failed because <error message from doNotCareIfThisFailsOrSucceeds>\n' +
          '  - Failing step failed because <error message from doSomethingThatFails>\n'
        expect(error.message).toEqual(expectedMessage)
      })
  })
})
