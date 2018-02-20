import Transaction from '../src/transaction'
import 'babel-polyfill'

import {
  flushPromises
} from './helpers'

describe('Transaction', () => {
  let transaction
  let steps
  let callOrder

  function makeSpy (name) {
    return jasmine.createSpy(name).and.callFake(() => {
      callOrder.push(name)
      return steps[name].result
    })
  }

  beforeEach(() => {
    callOrder = []
    steps = {
      'step1': { spy: makeSpy('step1'), result: Promise.resolve() },
      'step2': { spy: makeSpy('step2'), result: Promise.resolve() },
      'step3': { spy: makeSpy('step3'), result: Promise.resolve() },
      'step4': { spy: makeSpy('step4'), result: Promise.resolve() },
      'step5': { spy: makeSpy('step5'), result: Promise.resolve() }
    }
    transaction = new Transaction(Object.values(steps).map(step => step.spy))
    transaction.onError(error => fail(error.message))
  })

  describe('happy-path operation', () => {
    it('runs each step in order', async () => {
      transaction.execute()
      await flushPromises()
      expect(callOrder).toEqual([
        'step1',
        'step2',
        'step3',
        'step4',
        'step5'
      ])
    })

    it('does not run a subsequent step until the Promise returned by the former resolves', async () => {
      let resolveStep3
      steps.step3.result = new Promise((resolve, reject) => { resolveStep3 = () => resolve() })
      transaction.execute()
      await flushPromises()
      expect(callOrder).toEqual([
        'step1',
        'step2',
        'step3'
      ])
      callOrder.length = 0
      resolveStep3()
      await flushPromises()
      expect(callOrder).toEqual([
        'step4',
        'step5'
      ])
    })

    it('calls the onSuccess callback when the last step\'s Promise resolves', async () => {
      let resolveStep5
      steps.step5.result = new Promise((resolve, reject) => { resolveStep5 = () => resolve() })
      const onSuccess = jasmine.createSpy('onSuccess')
      transaction.onSuccess(onSuccess)
      transaction.execute()
      await flushPromises()
      expect(onSuccess).not.toHaveBeenCalled()

      resolveStep5()
      await flushPromises()
      expect(onSuccess).toHaveBeenCalled()
    })

    it('offers `then` as an alternative to onSuccess', async () => {
      let resolveStep5
      steps.step5.result = new Promise((resolve, reject) => { resolveStep5 = () => resolve() })
      const thenBlock = jasmine.createSpy('thenBlock')
      transaction.then(thenBlock)
      transaction.execute()
      await flushPromises()
      expect(thenBlock).not.toHaveBeenCalled()

      resolveStep5()
      await flushPromises()
      expect(thenBlock).toHaveBeenCalled()
    })

    it('calls the most recently provided onSuccess callback when the last step\'s Promise resolves', async () => {
      const firstOnSuccess = jasmine.createSpy('firstOnSuccess')
      const secondOnSuccess = jasmine.createSpy('secondOnSuccess')
      const lastOnSuccess = jasmine.createSpy('lastOnSuccess')

      transaction.onSuccess(firstOnSuccess)
      transaction.onSuccess(secondOnSuccess)
      transaction.onSuccess(lastOnSuccess)
      transaction.execute()
      await flushPromises()
      expect(firstOnSuccess).not.toHaveBeenCalled()
      expect(secondOnSuccess).not.toHaveBeenCalled()
      expect(lastOnSuccess).toHaveBeenCalled()
    })

    it('does not error if no onSuccess callback was provided but the last step\'s Promise resolves', async () => {
      transaction.onSuccess(null)
      transaction.onError(fail)
      transaction.execute()
    })
  })

  describe('resuming execution', () => {
    it('does not run a subsequent step if the Promise returned by the former rejects', async () => {
      const expectedError = new Error('expected error')
      steps.step3.result = Promise.reject(expectedError)
      transaction.onError(error => { if (error !== expectedError) { fail(error) } })
      transaction.execute()
      await flushPromises()
      expect(callOrder).toEqual([
        'step1',
        'step2',
        'step3'
      ])
    })

    it('calls the onError callback with the error when a step\'s returned Promise rejects', async () => {
      const error = new Error('some error')
      steps.step4.result = Promise.reject(error)
      const onError = jasmine.createSpy('onError')
      transaction.onError(onError)
      transaction.execute()
      await flushPromises()
      expect(onError).toHaveBeenCalledWith(error)
      expect(onError.calls.mostRecent().args[0].message).toEqual('Error in 4th step: some error')
    })

    it('calls the most recently provided onError callback with the error when a step\'s returned Promise rejects', async () => {
      const firstOnError = jasmine.createSpy('firstOnError')
      const secondOnError = jasmine.createSpy('secondOnError')
      const lastOnError = jasmine.createSpy('lastOnError')
      steps.step2.result = Promise.reject(new Error('step 2 failed'))

      transaction.onError(firstOnError)
      transaction.onError(secondOnError)
      transaction.onError(lastOnError)
      transaction.execute()
      await flushPromises()
      expect(firstOnError).not.toHaveBeenCalled()
      expect(secondOnError).not.toHaveBeenCalled()
      expect(lastOnError).toHaveBeenCalledTimes(1)
    })

    it('reruns the failed step and all subsequent steps when the `resume` callback passed to onError is called', async () => {
      const error = new Error('step 3 failed')
      steps.step3.result = Promise.reject(error)
      transaction.onError(thrownError => thrownError === error ? null : fail(thrownError))
      transaction.execute()
      await flushPromises()
      expect(callOrder).toEqual([
        'step1',
        'step2',
        'step3'
      ])
      callOrder.length = 0
      steps.step3.result = Promise.resolve()
      transaction.resume()
      await flushPromises()
      expect(callOrder).toEqual([
        'step3',
        'step4',
        'step5'
      ])
    })
  })

  describe('shared context', () => {
    it('passes an empty object to the first step if no context is provided', async () => {
      transaction.execute()
      await flushPromises()
      expect(steps.step1.spy.calls.mostRecent().args).toEqual([ {} ])
    })

    it('passes the object provided to the execute method to the first step as context', async () => {
      const context = { foo: 'bar' }
      transaction.execute(context)
      await flushPromises()
      expect(steps.step1.spy.calls.mostRecent().args).toEqual([ context ])
      expect(steps.step2.spy.calls.mostRecent().args).toEqual([ context ])
      expect(steps.step3.spy.calls.mostRecent().args).toEqual([ context ])
      expect(steps.step4.spy.calls.mostRecent().args).toEqual([ context ])
      expect(steps.step5.spy.calls.mostRecent().args).toEqual([ context ])
    })

    it('merges returned object into context and passes it to the next step as context and doesn\'t error if any steps return nothing or non-objects', async () => {
      const initialContext = { initial: 'foo', willBeOverwritten: 'initial' }
      steps.step1.result = Promise.resolve({ step1Context: 'bar', willBeOverwritten: 'new value' })
      steps.step3.result = Promise.resolve('foobar')
      transaction.execute(initialContext)
      await flushPromises()
      const expectedContext = {
        initial: 'foo',
        willBeOverwritten: 'new value',
        step1Context: 'bar'
      }
      expect(steps.step1.spy.calls.mostRecent().args).toEqual([ initialContext ])
      expect(steps.step2.spy.calls.mostRecent().args).toEqual([ expectedContext ])
      expect(steps.step3.spy.calls.mostRecent().args).toEqual([ expectedContext ])
      expect(steps.step4.spy.calls.mostRecent().args).toEqual([ expectedContext ])
      expect(steps.step5.spy.calls.mostRecent().args).toEqual([ expectedContext ])
    })

    it('correctly remembers the context in the case of error and resume', async () => {
      steps.step1.result = Promise.resolve({ step1: 'foo' })
      steps.step2.result = Promise.resolve({ step2: 'bar' })
      steps.step3.result = Promise.resolve({ step3: 'baz' })
      const error = new Error('step 4 failed')
      steps.step4.result = Promise.reject(error)
      transaction.onError(thrownError => thrownError === error ? null : fail(thrownError))
      transaction.execute({ initial: 'zilch' })
      await flushPromises()
      const expectedContext = {
        initial: 'zilch',
        step1: 'foo',
        step2: 'bar',
        step3: 'baz'
      }
      expect(steps.step4.spy.calls.mostRecent().args).toEqual([ expectedContext ])
      expect(steps.step4.spy).toHaveBeenCalledTimes(1)
      expect(steps.step5.spy).toHaveBeenCalledTimes(0)

      steps.step4.result = Promise.resolve({ step4: 'quux' })

      transaction.resume()
      await flushPromises()

      expect(steps.step4.spy).toHaveBeenCalledTimes(2)
      expect(steps.step4.spy.calls.mostRecent().args).toEqual([ expectedContext ])
      expect(steps.step5.spy).toHaveBeenCalledTimes(1)
      expectedContext.step4 = 'quux'
      expect(steps.step5.spy.calls.mostRecent().args).toEqual([ expectedContext ])
    })
  })

  describe('onSpecificError', () => {
    let onError
    beforeEach(() => {
      onError = jasmine.createSpy('onError')
      transaction.onError(onError)
    })

    it('doesn\'t override other callbacks for the same error', async () => {
      const firstErrorHandler = jasmine.createSpy('firstErrorHandler')
      const secondErrorHandler = jasmine.createSpy('secondErrorHandler')
      const thirdErrorHandler = jasmine.createSpy('thirdErrorHandler')
      transaction.onSpecificError('something-specific', firstErrorHandler)
      transaction.onSpecificError('something-specific', secondErrorHandler)
      transaction.onSpecificError('something-specific', thirdErrorHandler)
      steps.step2.result = Promise.reject(new Error('something-specific'))

      transaction.execute()
      await flushPromises()
      expect(onError).not.toHaveBeenCalled()
      expect(firstErrorHandler).toHaveBeenCalled()
      expect(secondErrorHandler).toHaveBeenCalled()
      expect(thirdErrorHandler).toHaveBeenCalled()
    })

    it('adds a callback to be called instead of onError if the thrown error message is exactly the error string', async () => {
      const onFizzleQuuzError = jasmine.createSpy('onFizzleQuuzError')
      transaction.onSpecificError('fizzle-quux', onFizzleQuuzError)
      steps.step2.result = Promise.reject(new Error('fizzle-quux'))
      transaction.execute()
      await flushPromises()
      expect(onError).not.toHaveBeenCalled()
      expect(onFizzleQuuzError).toHaveBeenCalled()
    })

    it('adds a callback to be called if the thrown error message matches the error pattern', async () => {
      const onBazError = jasmine.createSpy('onBazError')
      transaction.onSpecificError(/b[aeiou]z/, onBazError)
      steps.step2.result = Promise.reject(new Error('biz'))
      transaction.execute()
      await flushPromises()
      expect(onError).not.toHaveBeenCalled()
      expect(onBazError).toHaveBeenCalled()
    })

    it('does not call the callback method if the error thrown does not match the error pattern and does not exactly match the error string', async () => {
      const onStringMatchedError = jasmine.createSpy('onStringMatchedError')
      const onOtherStringMatchedError = jasmine.createSpy('onOtherStringMatchedError')
      const onPatternMatchedError = jasmine.createSpy('onPatternMatchedError')
      transaction.onSpecificError('bar', onStringMatchedError)
      transaction.onSpecificError('foo', onOtherStringMatchedError)
      transaction.onSpecificError(/does not match/, onPatternMatchedError)

      steps.step4.result = Promise.reject(new Error('foo bar'))
      transaction.execute()
      await flushPromises()

      expect(onStringMatchedError).not.toHaveBeenCalled()
      expect(onOtherStringMatchedError).not.toHaveBeenCalled()
      expect(onPatternMatchedError).not.toHaveBeenCalled()
    })

    it('still calls the main onError callback if no onSpecificError callbacks match the thrown error', async () => {
      transaction.onSpecificError('bad stuff', () => {})
      transaction.onSpecificError('other bad stuff', () => {})
      steps.step3.result = Promise.reject(new Error('another bad thing'))
      transaction.execute()
      await flushPromises()
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('onResume', () => {
    it('registers a callback which is called when the transaction is resumed', async () => {
      const error = new Error('step 4 failed')
      steps.step4.result = Promise.reject(error)
      transaction.onError(thrownError => thrownError === error ? null : fail(thrownError))

      const firstOnResume = jasmine.createSpy('firstOnResume')
      const anotherOnResume = jasmine.createSpy('anotherOnResume')
      const finalOnResume = jasmine.createSpy('finalOnResume')

      transaction.onResume(firstOnResume)
      transaction.onResume(anotherOnResume)
      transaction.onResume(finalOnResume)

      transaction.execute()
      await flushPromises()
      expect(firstOnResume).not.toHaveBeenCalled()
      expect(anotherOnResume).not.toHaveBeenCalled()
      expect(finalOnResume).not.toHaveBeenCalled()

      transaction.resume()
      await flushPromises()
      expect(firstOnResume).not.toHaveBeenCalled()
      expect(anotherOnResume).not.toHaveBeenCalled()
      expect(finalOnResume).toHaveBeenCalled()
    })
  })

  describe('execute', () => {
    it('errors if called before an onError callback is assigned', () => {
      transaction = new Transaction(Object.values(steps).map(step => step.spy))
      expect(() => transaction.execute()).toThrowError(/You called `execute` before assigning an `onError` callback./)
    })

    it('does not error if called after an onError callback is assigned', () => {
      transaction = new Transaction(Object.values(steps).map(step => step.spy))
      transaction.onError(() => {})
      expect(() => transaction.execute()).not.toThrow()
    })

    it('errors if it is called after the transaction has been started', async () => {
      steps.step1.result = Promise.reject(new Error('error in first step'))
      transaction.onError(() => {})
      transaction.execute()
      await flushPromises()
      expect(() => transaction.execute()).toThrowError(/Transaction is already in progress. To resume the transaction, use the `resume` method instead of `execute`/)
    })
  })

  describe('constructor error handling', () => {
    it('errors if it is constructed with a step that isn\'t a function', () => {
      expect(() => new Transaction([
        () => {},
        () => {},
        false,
        () => {}
      ])).toThrowError(/3rd Transaction step is not a function/i)
      expect(() => new Transaction([
        () => {},
        false,
        () => {},
        () => {}
      ])).toThrowError(/2nd Transaction step is not a function/i)
    })

    it('does not error if it is constructed with all function steps', () => {
      expect(() => new Transaction([
        () => {},
        () => {},
        () => {},
        () => {}
      ])).not.toThrow()
    })

    it('errors if it is constructed with an empty list of steps', () => {
      expect(() => new Transaction([])).toThrowError(/transaction needs at least one step/i)
    })

    it('errors if it is constructed with a non-Array value for steps', () => {
      expect(() => new Transaction('apple sauce')).toThrowError(/expected a list of functions, got "apple sauce"/i)
    })
  })

  describe('step error handling', () => {
    it('indicates the correct step that an error occured in if it is a synchronous exception', async () => {
      steps.step3.spy.and.callFake(() => { throw new Error('problem in starting step 3') })
      const onError = jasmine.createSpy('onError')
      transaction.onError(onError)
      transaction.execute()
      await flushPromises()
      expect(onError.calls.mostRecent().args[0].message).toMatch(/Error in 3rd step: problem in starting step 3/)
    })

    it('throws descriptive error if an error occurs in an onSuccess callback', async () => {
      const onError = jasmine.createSpy('onError')
      transaction.onError(onError)
      transaction.onSuccess(() => { throw new Error('problem with onSuccess') })
      transaction.execute()
      await flushPromises()
      expect(onError.calls.mostRecent().args[0].message).toMatch(/Error in onSuccess callback: problem with onSuccess/)
    })

    it('indicates the correct step that an error occured in if it is a synchronous exception in the last step', async () => {
      steps.step5.spy.and.callFake(() => { throw new Error('problem in starting step 5') })
      const onError = jasmine.createSpy('onError')
      transaction.onError(onError)
      transaction.execute()
      await flushPromises()
      expect(onError.calls.mostRecent().args[0].message).toMatch(/Error in 5th step/)
    })

    it('indicates the correct step that an error occured in if it is indicated by a rejected Promise in the last step', async () => {
      steps.step5.result = Promise.reject(new Error('problem during step 5'))
      const onError = jasmine.createSpy('onError')
      transaction.onError(onError)
      transaction.execute()
      await flushPromises()
      expect(onError.calls.mostRecent().args[0].message).toMatch(/Error in 5th step: problem during step 5/)
    })

    it('thows a descriptive error if a step does not return a promise', async () => {
      let returnedError
      transaction.onError(error => { returnedError = error })
      steps.step2.result = { not: 'a promise' }
      transaction.execute()
      await flushPromises()
      expect(returnedError.message).toMatch(/2nd step.*didn't return a Promise.*{"not":"a promise"}/)
    })

    it('thows a descriptive error if a step returns undefined', async () => {
      let returnedError
      transaction.onError(error => { returnedError = error })
      steps.step2.result = undefined
      transaction.execute()
      await flushPromises()
      expect(returnedError.message).toMatch(/2nd step.*didn't return a Promise.*undefined/)
    })

    it('issues warning if an onError callback calls `resolve` synchronously', async () => {
      steps.step4.result = Promise.reject(new Error('problem with step 4'))
      let thrownError
      transaction.onError(() => {
        try {
          transaction.resume()
        } catch (error) {
          thrownError = error
        }
      })
      spyOn(console, 'warn')
      transaction.execute()
      await flushPromises()
      const warning = 'You called `resolve` synchronously in an onError callback, which could produce an infinite loop. You should probably get user input before resuming the transaction -- or if you intend to restart it automatically, you should implement that inside of the Transaction class as an auto-retry param. If you do, only show this warning if auto-retry is not set to true.'
      expect(console.warn).toHaveBeenCalledWith(warning)
      expect(thrownError.message).toEqual(warning)
    })
  })
})
