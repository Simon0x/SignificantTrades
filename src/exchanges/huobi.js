const Exchange = require('../exchange')
const pako = require('pako')

class Huobi extends Exchange {
  constructor(options) {
    super(options)

    this.id = 'huobi'

    this.contractTypesAliases = {
      this_week: 'CW',
      next_week: 'NW',
      quarter: 'CQ',
    }

    this.endpoints = {
      PRODUCTS: [
        'https://api.huobi.pro/v1/common/symbols',
        'https://api.hbdm.com/api/v1/contract_contract_info',
        'https://api.hbdm.com/swap-api/v1/swap_contract_info',
      ],
    }

    this.options = Object.assign(
      {
        url: (pair) => {
          if (this.types[pair] === 'futures') {
            return 'wss://www.hbdm.com/ws'
          } else if (this.types[pair] === 'swap') {
            return 'wss://api.hbdm.com/swap-ws'
          } else {
            return 'wss://api.huobi.pro/ws'
          }
        },
      },
      this.options
    )
  }

  formatProducts(response) {
    const products = []
    const specs = {}
    const types = {}

    for (let data of response) {
      let type = ['spot', 'futures', 'swap'][response.indexOf(data)]

      for (let product of data.data) {
        let pair

        switch (type) {
          case 'spot':
            pair = (product['base-currency'] + product['quote-currency']).toLowerCase()
            break
          case 'futures':
            pair = product.symbol + '_' + this.contractTypesAliases[product.contract_type]
            break
          case 'swap':
            pair = product.contract_code
            break
        }

        if (products.find((a) => a.toLowerCase() === pair.toLowerCase())) {
          throw new Error('duplicate pair detected on huobi exchange (' + pair + ')')
        }

        types[pair] = type

        products.push(pair)
      }
    }

    return {
      products,
      specs,
      types,
    }
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  subscribe(api, pair) {
    if (!super.subscribe.apply(this, arguments)) {
      return
    }

    api.send(
      JSON.stringify({
        sub: 'market.' + pair + '.trade.detail',
        id: pair,
      })
    )
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  unsubscribe(api, pair) {
    if (!super.unsubscribe.apply(this, arguments)) {
      return
    }

    api.send(
      JSON.stringify({
        unsub: 'market.' + pair + '.trade.detail',
        id: pair,
      })
    )
  }

  onMessage(event, api) {
    const json = JSON.parse(pako.inflate(event.data, { to: 'string' }))

    if (!json) {
      console.log(json)
      return
    }

    if (json.ping) {
      api.send(JSON.stringify({ pong: json.ping }))
      return
    } else if (json.tick && json.tick.data && json.tick.data.length) {
      const remotePair = json.ch.replace(/market.(.*).trade.detail/, '$1')

      let name = this.id

      if (!this.types[remotePair]) {
        debugger
      }

      if (this.types[remotePair] !== 'spot') {
        name += '_futures'
      }

      this.emitTrades(
        api.id,
        json.tick.data.map((trade) => {
          let amount = +trade.amount

          if (typeof this.specs[remotePair] !== 'undefined') {
            amount = (amount * this.specs[remotePair]) / trade.price
          }

          return {
            exchange: name,
            pair: remotePair,
            timestamp: trade.ts,
            price: +trade.price,
            size: amount,
            side: trade.direction,
          }
        })
      )

      return true
    }
  }
}

module.exports = Huobi
