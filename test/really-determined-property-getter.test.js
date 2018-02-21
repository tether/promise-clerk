import ReallyDeterminedPropertyGetter from '../src/really-determined-property-getter'
import 'babel-polyfill'

import {
  flushPromises
} from './helpers'

describe('ReallyDeterminedPropertyGetter', () => {
  let value
  beforeEach(() => {
    value = new ReallyDeterminedPropertyGetter()
  })

  describe('integration of the various methods', () => {
    it('correctly selects the first verified source, runs the primarySourceSynchronizer function, and resolves with the correct value', () => {
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      return new ReallyDeterminedPropertyGetter()
        .verify(value => Array.isArray(value) && value.length >= 5)
        .primarySource(() => Promise.reject(new Error('no luck with the primary')))
        .secondarySource(() => Promise.reject(new Error('no luck with the first secondary source')))
        .secondarySource(() => Promise.resolve([1, 2, 3]))
        .secondarySource(() => Promise.resolve('1 2 3 4 5'))
        .secondarySource(() => Promise.resolve([1, 2, 3, 4, 5]))
        .secondarySource(() => { fail('this should never be called'); return Promise.resolve() })
        .synchronizeWithPrimarySource(primarySourceSynchronizer)
        .get()
        .then(value => {
          expect(primarySourceSynchronizer).toHaveBeenCalledWith([1, 2, 3, 4, 5])
          expect(value).toEqual([1, 2, 3, 4, 5])
        }).catch(fail)
    })

    it('displays a detailed error message', () => {
      return new ReallyDeterminedPropertyGetter()
        .verify(value => Array.isArray(value) && value.length >= 5)
        .primarySource(() => Promise.reject(new Error('no luck with the primary')))
        .secondarySource(() => Promise.reject(new Error('no luck with the first secondary source')))
        .secondarySource(() => Promise.resolve([1, 2, 3]))
        .secondarySource(() => Promise.resolve('1 2 3 4 5'))
        .secondarySource(() => Promise.resolve([1, 2, 3, 4, 5]))
        .secondarySource(() => Promise.resolve([1, 2, 3, 4, 5]))
        .secondarySource(() => Promise.resolve([1, 2, 3, 4, 5]))
        .secondarySource(() => { fail('this should never be called'); return Promise.resolve() })
        .synchronizeWithPrimarySource(() => Promise.resolve())
        .synchronizeWithPrimarySource(() => Promise.reject(new Error('nope')))
        .synchronizeWithPrimarySource(() => Promise.resolve())
        .get()
        .then(() => fail('expected to reject'))
        .catch(error => {
          const errorMessage = 'The Really Determined Property Getter has failed.\n' +
          '  - primary source failed because it was rejected with \'Error: no luck with the primary\'\n' +
          '  - secondary source #1 failed because it was rejected with \'Error: no luck with the first secondary source\'\n' +
          '  - secondary source #2 failed because the verifier function did not accept the value [1,2,3]\n' +
          '  - secondary source #3 failed because the verifier function did not accept the value "1 2 3 4 5"\n' +
          '  - secondary source #4 resolved with [1,2,3,4,5]\n' +
          '  - primarySourceSynchronizer function #2 failed because it was rejected with \'Error: nope\'\n'
          expect(error.message).toEqual(errorMessage)
        })
    })
  })

  describe('primarySource', () => {
    it('defines a basic getter method', () => {
      value.primarySource(() => Promise.resolve('primary'))
      return expect(value.get()).resolves.toEqual('primary')
    })

    it('returns the main object to support chaining', () => {
      expect(value.primarySource(() => {})).toBe(value)
    })

    it('throws an error if called multiple times', () => {
      value.primarySource(() => { let first = true }) // eslint-disable-line
      expect(() => value.primarySource(() => {})).toThrowError('There can only be one primary source. You already registered this primary source:\nfunction () {var first = true;}')
    })
  })

  describe('secondarySource', () => {
    it('does not get called by `get` if the primary source Promise resolves', () => {
      const secondary = jasmine.createSpy('secondary')
      value.primarySource(() => Promise.resolve())
      value.secondarySource(secondary)
      value.get()
      expect(secondary).not.toHaveBeenCalled()
    })

    it('returns the main object to support chaining', () => {
      expect(value.secondarySource(() => {})).toBe(value)
    })

    it('is called by `get` and it\'s Promise is returned if the primary source Promise rejects', async () => {
      const secondary = jasmine.createSpy('secondary').and.returnValue(Promise.resolve('from secondary'))
      value.primarySource(() => Promise.reject(new Error('problem with primary')))
      value.secondarySource(secondary)
      let result = await value.get()
      expect(secondary).toHaveBeenCalled()
      expect(result).toEqual('from secondary')
    })

    it('can be called multiple times to add multiple secondary sources', () => {
      value.primarySource(() => Promise.reject(new Error('problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #1')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #2')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #3')))
      value.secondarySource(() => Promise.resolve('the one we want'))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #5')))
      return expect(value.get()).resolves.toEqual('the one we want')
    })
  })

  describe('get', () => {
    it('throws an error if called without a primary source', () => {
      expect(() => value.get()).toThrowError('Cannot get value without a primary source. Use `.primarySource(() => primarySourcePromise)`')
    })

    it('throws an error if the primary source returns something other than a Promise', () => {
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because it was expected to return a Promise, but instead it returned "not a promise"\n'
      return expect(value.primarySource(() => 'not a promise').get()).rejects.toEqual(new Error(errorMessage))
    })

    it('throws an error if any secondary source returns something other than a Promise', () => {
      value.primarySource(() => Promise.reject(new Error('problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #1')))
      value.secondarySource(() => ({ vanilla: 'object' }))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #3')))
      return expect(value.get().catch(error => error.message)).resolves.toMatch(/secondary source #2 failed because it was expected to return a Promise, but instead it returned {"vanilla":"object"}/)
    })

    it('can be called again if it is complete (and completed by a secondary source)', async () => {
      value.primarySource(() => Promise.reject(new Error('another problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #1')))
      const secondaryThatSucceeds = jasmine.createSpy('secondaryThatSucceeds').and.returnValues(
        Promise.resolve('the first one'),
        Promise.resolve('another one'),
        Promise.resolve('the last one')
      )
      value.secondarySource(secondaryThatSucceeds)
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #3')))
      expect(await value.get()).toEqual('the first one')
      expect(await value.get()).toEqual('another one')
      expect(await value.get()).toEqual('the last one')
    })

    it('can be called again if it is complete (and completed by the primary source)', async () => {
      const primary = jasmine.createSpy('primary').and.returnValues(
        Promise.resolve('the first one'),
        Promise.resolve('another one'),
        Promise.resolve('the last one')
      )
      value.primarySource(primary)

      expect(await value.get()).toEqual('the first one')
      expect(await value.get()).toEqual('another one')
      expect(await value.get()).toEqual('the last one')
    })

    it('can be called again if the synchronizer failed', async () => {
      value.primarySource(() => Promise.reject(new Error('no primary')))
      value.secondarySource(() => Promise.resolve('good secondary'))
      const synchronizer = jasmine.createSpy('synchronizer').and.returnValues(
        Promise.reject(new Error('failed')),
        Promise.resolve()
      )
      value.synchronizeWithPrimarySource(synchronizer)
      await value.get().catch(() => {})
      return expect(value.get()).resolves.toEqual('good secondary')
    })

    it('can be called again if there was source with a acceptable value (so every source\'s Promise rejected)', async () => {
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary')))
      await value.get().catch(() => {})
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because it was rejected with \'Error: bad primary\'\n' +
        '  - secondary source #1 failed because it was rejected with \'Error: bad secondary\'\n'
      return expect(value.get()).rejects.toEqual(new Error(errorMessage))
    })

    it('throws an error if it is called again before the primary source has resolved', () => {
      value.primarySource(() => new Promise((resolve, reject) => {}))
      value.get()
      expect(() => value.get()).toThrowError('`get` was called again before the first call to `get` completed. This will produce unexpected behavior and is not allowed.')
    })

    it('throws an error if it is called again before one of the secondary sources has resolved', () => {
      value.primarySource(() => Promise.reject(new Error('another problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #1')))
      value.secondarySource(() => new Promise((resolve, reject) => {}))
      value.secondarySource(() => Promise.reject(new Error('problem with secondary #3')))
      value.get()
      expect(() => value.get()).toThrowError('`get` was called again before the first call to `get` completed. This will produce unexpected behavior and is not allowed.')
    })

    it('rejects if the primarySourceSynchronizer method is used but does not return a Promise', () => {
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.resolve('good secondary'))
      value.synchronizeWithPrimarySource(() => Promise.resolve())
      value.synchronizeWithPrimarySource(() => Promise.resolve())
      value.synchronizeWithPrimarySource(() => ({ not: 'a promise' }))
      value.synchronizeWithPrimarySource(() => Promise.resolve())
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because it was rejected with \'Error: bad primary\'\n' +
        '  - secondary source #1 resolved with "good secondary"\n' +
        '  - primarySourceSynchronizer function #3 failed because it was expected to return a Promise, but instead it returned {"not":"a promise"}\n'
      return expect(value.get()).rejects.toEqual(new Error(errorMessage))
    })

    it('has a descriptive error message', () => {
      value.primarySource(() => Promise.reject(new Error('primary source failed')))
      value.secondarySource(() => Promise.resolve('secondary #1'))
      value.secondarySource(() => Promise.resolve('secondary #2'))
      value.secondarySource(() => Promise.reject(new Error('secondary 3 failed')))
      value.secondarySource(() => Promise.resolve('secondary #4'))
      value.verify(() => false)
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because it was rejected with \'Error: primary source failed\'\n' +
        '  - secondary source #1 failed because the verifier function did not accept the value "secondary #1"\n' +
        '  - secondary source #2 failed because the verifier function did not accept the value "secondary #2"\n' +
        '  - secondary source #3 failed because it was rejected with \'Error: secondary 3 failed\'\n' +
        '  - secondary source #4 failed because the verifier function did not accept the value "secondary #4"\n'
      return expect(value.get()).rejects.toEqual(new Error(errorMessage))
    })
  })

  describe('verify', () => {
    it('changes the behavior of `get` to reject any resolved values for which this primarySourceSynchronizer function returns false', () => {
      value.primarySource(() => Promise.resolve('primary'))
      value.secondarySource(() => Promise.resolve('secondary #1'))
      value.secondarySource(() => Promise.resolve('secondary #2'))
      value.secondarySource(() => Promise.reject(new Error('secondary 3 failed')))
      value.secondarySource(() => Promise.resolve('secondary #4'))
      value.verify(() => false)
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because the verifier function did not accept the value "primary"\n' +
        '  - secondary source #1 failed because the verifier function did not accept the value "secondary #1"\n' +
        '  - secondary source #2 failed because the verifier function did not accept the value "secondary #2"\n' +
        '  - secondary source #3 failed because it was rejected with \'Error: secondary 3 failed\'\n' +
        '  - secondary source #4 failed because the verifier function did not accept the value "secondary #4"\n'
      return expect(value.get()).rejects.toEqual(new Error(errorMessage))
    })

    it('does not change the behavior of `get` when the valid function returns true', () => {
      value.primarySource(() => Promise.reject(new Error('no primary')))
      value.secondarySource(() => Promise.reject(new Error('secondary #1 failed')))
      value.secondarySource(() => Promise.reject(new Error('secondary #2 failed')))
      value.secondarySource(() => Promise.resolve('voila!'))
      value.secondarySource(() => Promise.reject(new Error('secondary #4 failed')))
      value.verify(() => true)
      return expect(value.get()).resolves.toEqual('voila!')
    })

    it('allows one to accept only resolved values matching a certain criteria', () => {
      value.primarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('good 1'))
      value.secondarySource(() => Promise.resolve('good 2'))
      value.verify(value => value !== 'bad')
      return expect(value.get()).resolves.toEqual('good 1')
    })

    it('throws an error if called multiple times', () => {
      value.verify(value => value.good === true)
      expect(() => value.verify(() => {})).toThrowError('There can only be one verifier function. You already registered this verifier function:\nfunction (value) {return value.good === true;}')
    })

    it('returns the main object to support chaining', () => {
      expect(value.verify(() => {})).toBe(value)
    })
  })

  describe('synchronizeWithPrimarySource', () => {
    it('registers a callback which never gets called if the primary source resolves and is verified', async () => {
      value.primarySource(() => Promise.resolve('good'))
      value.secondarySource(() => Promise.reject(new Error('no secondary')))
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get()
      expect(primarySourceSynchronizer).not.toHaveBeenCalled()
    })

    it('registers a callback which is called if the primary source resolves, is not verified, and a secondary source resolves and is verified', async () => {
      value.primarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('the secondary value'))
      value.verify(value => value !== 'bad')
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get()
      expect(primarySourceSynchronizer).toHaveBeenCalledWith('the secondary value')
    })

    it('registers a callback which is called if the primary source rejects, and a secondary source resolves and is verified', async () => {
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.resolve('the secondary value'))
      value.verify(value => value !== 'bad')
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get()
      expect(primarySourceSynchronizer).toHaveBeenCalledWith('the secondary value')
    })

    it('registers a callback which is never called if the primary source resolves, is not verified, and no secondary source resolves', async () => {
      value.primarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #1')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #2')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #3')))
      value.verify(value => value !== 'bad')
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get().catch(() => {})
      expect(primarySourceSynchronizer).not.toHaveBeenCalled()
    })

    it('registers a callback which is never called if the primary source resolves, is not verified, and each secondary source that resolves is not verified', async () => {
      value.primarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #1')))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #3')))
      value.verify(value => value !== 'bad')
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get().catch(() => {})
      expect(primarySourceSynchronizer).not.toHaveBeenCalled()
    })

    it('registers a callback which is never called if the primary source rejects, and no secondary source resolves', async () => {
      value.primarySource(() => Promise.reject(new Error('problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #1')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #2')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #3')))
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get().catch(() => {})
      expect(primarySourceSynchronizer).not.toHaveBeenCalled()
    })

    it('registers a callback which is never called if the primary source rejects, and each secondary source that resolves is not verified', async () => {
      value.primarySource(() => Promise.reject(new Error('problem with primary')))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #1')))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.resolve('bad'))
      value.secondarySource(() => Promise.reject(new Error('bad secondary #3')))
      value.verify(value => value !== 'bad')
      const primarySourceSynchronizer = jasmine.createSpy('primarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(primarySourceSynchronizer)
      await value.get().catch(() => {})
      expect(primarySourceSynchronizer).not.toHaveBeenCalled()
    })

    it('registers multiple callbacks if called multiple times', async () => {
      const firstPrimarySourceSynchronizer = jasmine.createSpy('firstPrimarySourceSynchronizer').and.returnValue(Promise.resolve())
      const secondPrimarySourceSynchronizer = jasmine.createSpy('secondPrimarySourceSynchronizer').and.returnValue(Promise.resolve())
      const thirdPrimarySourceSynchronizer = jasmine.createSpy('thirdPrimarySourceSynchronizer').and.returnValue(Promise.resolve())
      value.synchronizeWithPrimarySource(firstPrimarySourceSynchronizer)
      value.synchronizeWithPrimarySource(secondPrimarySourceSynchronizer)
      value.synchronizeWithPrimarySource(thirdPrimarySourceSynchronizer)
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.resolve('good stuff'))
      await value.get()
      expect(firstPrimarySourceSynchronizer).toHaveBeenCalled()
      expect(secondPrimarySourceSynchronizer).toHaveBeenCalled()
      expect(thirdPrimarySourceSynchronizer).toHaveBeenCalled()
    })

    it('does not affect the value that `get` resolves with', () => {
      const firstPrimarySourceSynchronizer = jasmine.createSpy('firstPrimarySourceSynchronizer').and.returnValue(Promise.resolve('whatever'))
      const secondPrimarySourceSynchronizer = jasmine.createSpy('secondPrimarySourceSynchronizer').and.returnValue(Promise.resolve('not important'))
      value.synchronizeWithPrimarySource(firstPrimarySourceSynchronizer)
      value.synchronizeWithPrimarySource(secondPrimarySourceSynchronizer)
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.resolve('good stuff'))
      return expect(value.get()).resolves.toEqual('good stuff')
    })

    it('does not resolve the Promise returned by `get` until all primarySourceSynchronizer functions have resolved', async () => {
      let resolvePrimarySourceSynchronizer
      value.synchronizeWithPrimarySource(() => new Promise((resolve, reject) => { resolvePrimarySourceSynchronizer = resolve }))
      value.primarySource(() => Promise.reject(new Error('bad primary')))
      value.secondarySource(() => Promise.resolve('good secondary'))
      const afterGetIsFinished = jasmine.createSpy('afterGetIsFinished')
      value.get().then(afterGetIsFinished)
      await flushPromises()
      expect(afterGetIsFinished).not.toHaveBeenCalled()
      resolvePrimarySourceSynchronizer()
      await flushPromises()
      expect(afterGetIsFinished).toHaveBeenCalled()
    })

    it('returns the main object to support chaining', () => {
      expect(value.synchronizeWithPrimarySource(() => {})).toBe(value)
    })

    it('has its rejection reason included in the overall rejection message', () => {
      value.synchronizeWithPrimarySource(() => Promise.reject(new Error('synchronization failed')))
      value.primarySource(() => Promise.reject(new Error('failure with the primary source')))
      value.secondarySource(() => Promise.resolve({ actual: 'value' }))
      const errorMessage = 'The Really Determined Property Getter has failed.\n' +
        '  - primary source failed because it was rejected with \'Error: failure with the primary source\'\n' +
        '  - secondary source #1 resolved with {"actual":"value"}\n' +
        '  - primarySourceSynchronizer function #1 failed because it was rejected with \'Error: synchronization failed\'\n'
      return expect(value.get()).rejects.toEqual(new Error(errorMessage))
    })
  })

  describe('ignoreSynchronizationErrors', () => {
    it('resolves with the secondary source despite synchronization errors when it has been called', () => {
      value.primarySource(() => Promise.reject(new Error('failure with the primary source')))
      value.secondarySource(() => Promise.resolve({ actual: 'value' }))
      value.synchronizeWithPrimarySource(() => { throw new Error('synchronization failed') })
      value.ignoreSynchronizationErrors()
      return expect(value.get()).resolves.toEqual({ actual: 'value' })
    })

    it('resolves with the secondary source despite synchronization rejection when it has been called', () => {
      value.primarySource(() => Promise.reject(new Error('failure with the primary source')))
      value.secondarySource(() => Promise.resolve({ actual: 'value' }))
      value.synchronizeWithPrimarySource(() => Promise.reject(new Error('synchronization failed')))
      value.ignoreSynchronizationErrors()
      return expect(value.get()).resolves.toEqual({ actual: 'value' })
    })

    it('returns the main object to support chaining', () => {
      expect(value.ignoreSynchronizationErrors()).toBe(value)
    })
  })
})
