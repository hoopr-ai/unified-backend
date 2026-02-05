'use strict'

exports.config = {
  app_name: ['Hoopr Backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,

  distributed_tracing: {
    enabled: true
  },

  application_logging: {
    forwarding: {
      enabled: true
    }
  },

  logging: {
    level: 'info'
  },

  allow_all_headers: true,

  attributes: {
    exclude: [
      'request.headers.authorization',
      'request.headers.cookie',
      'response.headers.setCookie'
    ]
  }
}
