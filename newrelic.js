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
    enabled: true,
    include: [
      'request.parameters.*',
      'request.uri',
      'response.status'
    ],
    exclude: [
      'request.headers.authorization',
      'request.headers.cookie',
      'response.headers.setCookie',
      'request.parameters.password',
      'request.parameters.token',
      'request.parameters.secret'
    ]
  },

  // Custom attributes for user activity tracking
  transaction_tracer: {
    enabled: true,
    record_sql: 'obfuscated',
    explain_threshold: 500,
    attributes: {
      enabled: true,
      include: ['userId', 'sessionId', 'action', 'deviceType', 'browser', 'os']
    }
  },

  // Error collector settings
  error_collector: {
    enabled: true,
    ignore_status_codes: [401, 403, 404],
    attributes: {
      enabled: true,
      include: ['userId', 'sessionId', 'endpoint', 'action']
    }
  },

  // Browser monitoring (if using)
  browser_monitoring: {
    attributes: {
      enabled: true,
      include: ['userId', 'action', 'deviceType']
    }
  },

  // Custom events for dashboard queries
  custom_insights_events: {
    enabled: true,
    max_samples_stored: 10000
  }
}
