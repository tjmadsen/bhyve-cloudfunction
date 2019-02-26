'use strict'
/*
 * orbit.js
 *
 * unofficial Orbit Bhyve API module
 * Bill Church - https://github.com/billchurch/bhyve-mqtt
 *
 */
const axios = require('axios')
const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const WebSocket = require('ws')
let ts = () => new Date().toISOString()

function Client () {
  if (!(this instanceof Client)) { return new Client() }
  EventEmitter.call(this)

  this.config = {
    wssURL: undefined,
    baseURL: undefined,
    timeout: undefined,
    email: undefined,
    password: undefined,
    debug: undefined
  }
  this._token = undefined
  this._user_id = undefined
  this._device = undefined
}
inherits(Client, EventEmitter)

// first step, get a token and generate an event on success or fail
Client.prototype.connect = function (cfg) {
  this.config.baseURL = cfg.baseURL || 'https://api.orbitbhyve.com'
  this.config.timeout = cfg.timeout || 1000
  this.config.email = cfg.email || undefined
  this.config.password = cfg.password || undefined
  this.config.debug = cfg.debug || false
  this.config.wssURL = cfg.wssURL || 'wss://api.orbitbhyve.com/v1/events'
  this.config.wsTimeout = cfg.wsTimeout || 1000
  this.config.debug = cfg.debug || false
  var self = this

  const getOrbitToken = () => {
    return new Promise((resolve, reject) => {
      const instance = axios.create({
        baseURL: self.config.baseURL,
        timeout: self.config.timeout
      })
      instance.post('/v1/session', {
        'session': {
          'email': self.config.email,
          'password': self.config.password
        }
      }).then(function (response) {
        self._token = response.data.orbit_session_token
        self._user_id = response.data.user_id
        // config for later sessions
        self._rest_config = { baseURL: self.config.baseURL, timeout: self.config.timeout, headers: { 'orbit-session-token': self._token } }
        if (self.config.debug) console.log(`${ts()} - response.data: ` + JSON.stringify(response.data))
        resolve(response)
      }).catch(function (err) {
        reject(err)
      })
    })
  }

  const doAccept = (response) => {
    if (self.config.debug) console.log(`${ts()} - token: ` + self._token + ' My UserID: ' + self._user_id)
    self.emit('token', self._token)
    self.emit('user_id', self._user_id)
  }
  const doReject = (err) => {
    if (self.config.debug) console.log(`${ts()} - error ` + err)
    self.emit('error', err)
  }

  let ost = getOrbitToken()
  ost.then(doAccept)
    .catch(doReject)
}

Client.prototype.devices = function () {
  var self = this

  const getDevices = () => {
    return new Promise((resolve, reject) => {
      const instance = axios.create(self._rest_config)
      instance.get('/v1/devices?user_id=' + self._user_id)
        .then(function (response) {
          if (self.config.debug) console.log(`${ts()} - response.data: ` + JSON.stringify(response.data))
          resolve(response)
        }).catch(function (err) {
          reject(err)
        })
    })
  }

  const doAccept = (response) => {
    if (self.config.debug) console.log(`${ts()} - response.data: ` + JSON.stringify(response.data))
    self.emit('devices', response.data)
  }
  const doReject = (err) => {
    if (self.config.debug) console.log(`${ts()} - error: ` + err)
    self.emit('error', err)
  }

  let Devices = getDevices()
  Devices.then(doAccept)
    .catch(doReject)
}

Client.prototype.connectStream = function () {
  var self = this

  const clientStream = new WebSocket(self.config.wssURL, {
    handshakeTimeout: self.config.wsTimeout
  })

  function sendPing () {
    if (self.config.debug) console.log(`${ts()} - websocket sending ping`)
    clientStream.send('{"event":"ping"}')
  }

  const authenticate = () => {
    let message = {
      'event': 'app_connection',
      'orbit_session_token': self._token
    }

    if (self.config.debug) console.log(`${ts()} - websocket authenticate message: ` + JSON.stringify(message))

    clientStream.send(JSON.stringify(message))
    setInterval(sendPing, 25 * 1000)
  }

  clientStream.on('open', authenticate)

  clientStream.on('message', function (data) {
    self.emit('message', data)
  })

  clientStream.on('error', function (err) {
    self.emit('error', err)
  })

  clientStream.on('close', function (num, reason) {
    if (self.config.debug) console.log(`${ts()} - close: ` + num + ' reason: ' + reason)
  })

  clientStream.on('ping', function (data) {
    if (self.config.debug) console.log(`${ts()} - ping data: ` + data)
  })

  clientStream.on('unexpected-response', function (request, response) {
    console.error(`${ts()} - unexpected-response / request: ` + request + ' response: ' + response)
  })
}

module.exports = Client
