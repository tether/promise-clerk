import * as index from '../src/index'
import assertIsPromise from '../src/assert-is-promise'
import PromiseChainErrorCatcher from '../src/promise-chain-error-catcher'
import ReallyDeterminedPropertyGetter from '../src/really-determined-property-getter'
import Quitter from '../src/quitter'
import Transaction from '../src/transaction'

describe('index exports', () => {
  it('correctly exports assertIsPromise', () => {
    expect(index.assertIsPromise).toBe(assertIsPromise)
  })

  it('correctly exports PromiseChainErrorCatcher', () => {
    expect(index.PromiseChainErrorCatcher).toBe(PromiseChainErrorCatcher)
  })

  it('correctly exports ReallyDeterminedPropertyGetter', () => {
    expect(index.ReallyDeterminedPropertyGetter).toBe(ReallyDeterminedPropertyGetter)
  })

  it('correctly exports Quitter', () => {
    expect(index.Quitter).toBe(Quitter)
  })

  it('correctly exports Transaction', () => {
    expect(index.Transaction).toBe(Transaction)
  })
})
