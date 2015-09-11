'use strict';

var fs              = require('fs');
var path            = require('path');
var util            = require('util');
var events          = require('events');
var shell           = require('shelljs');

var Promise         = require('bluebird');
var _               = require('lodash');

var request         = require('superagent'); //webhook
var uuid            = require('node-uuid');

var SMTPServer      = require('smtp-server').SMTPServer;
var dns             = require('dns');

var mailUtilities   = require('./mailUtilities');
var logger          = require('./logger');
var MailinReport    = require('./mailinReport');

function Mailin(options) {
    events.EventEmitter.call(this);

    /* Set up the default options. */
    this.defaults = {
        port: 2500,
        tmp: '.tmp',
        keepTmpFile: false,
        webhook: 'http://localhost:3000/webhook',
        disableWebhook: false,
        logFile: null,
        disableDkim: false,
        disableSpf: false,
        disableSpamScore: false,
        disableEmailParsing: false,
        disableLanguageDetection: false,
        disableDNSValidation: true,
        verbose: false,
        debug: false,
        logLevel: 'info',
        profile: false,
        smtpOptions: {
          banner: 'Mailin Smtp Server',
          logger: false,
          disabledCommands: ['AUTH']
        }
    };

    /* The simplesmtp server instance, 'exposed' as an undocuumented, private
     * member. It is not meant for normal usage, but is can be uuseful for
     * Mailin hacking.
     * The instance will be initialized only after that mailin.start() has been called. */
    this._smtp = null;

    options = options || {};

    this.options = _.assign({}, this.defaults, options);
}

util.inherits(Mailin, events.EventEmitter);

Mailin.prototype.start = function (options, callback) {
  var _this = this;
  var smtpOptions;
  var _session;

  options = options || {};
  if (_.isFunction(options)) {
     callback = options;
     options = {};
  }

  this.options = _.assign({}, this.options, options);
  this.options.smtpOptions.secure = Boolean(this.options.smtpOptions.secure);

  callback = callback || function () {};

  /* Create tmp dir if necessary. */
  if (!fs.existsSync(_this.options.tmp)) {
    shell.mkdir('-p', _this.options.tmp);
  }

  /* Log to a file if necessary. */
  if (_this.options.logFile) {
    logger.setLogFile(_this.options.logFile);
  }

  /* Set log level if necessary. */
  if (_this.options.logLevel) {
    logger.setLevel(_this.options.logLevel);
  }

  if (_this.options.verbose) {
    logger.setLevel('verbose');
    logger.info('Log level set to verbose.');
  }

  if (_this.options.debug) {
    logger.info('Debug option activated.');
    logger.setLevel('debug');
  }

  /* Basic memory profiling. */
  if (_this.options.profile) {
    logger.info('Enable memory profiling');
    setInterval(function () {
      var memoryUsage = process.memoryUsage();
      var ram = memoryUsage.rss + memoryUsage.heapUsed;
      var million = 1000000;
      logger.info('Ram Usage: ' + ram / million + 'mb | rss: ' + memoryUsage.rss / million +
          'mb | heapTotal: ' + memoryUsage.heapTotal / million +
          'mb | heapUsed: ' + memoryUsage.heapUsed / million);
    }, 500);
  }

  /* Check the webhook validity. */
  if (!_this.options.disableWebhook) {
    request.head({
      url: _this.options.webhook,
      timeout: 3000
    }, function (err, resp) {
      if (err || resp.statusCode !== 200) {
        logger.warn('Webhook ' + _this.options.webhook +
            ' seems invalid or down. You may want to double check the webhook url.');
      } else {
        logger.info('Webhook ' + _this.options.webhook + ' is valid, up and running.');
      }
    });
  }

  smtpOptions = _.extend({}, this.options.smtpOptions || {}, {
    onData: onData,
    onAuth: onAuth,
    onMailFrom: onMailFrom,
    onRcptTo: onRcptTo
  });

  this._smtp = new SMTPServer(smtpOptions);

  this._smtp.on('close', function () {
    logger.info('Closing smtp server');
    _this.emit('close', _session);
  });

  this._smtp.on('error', function (error) {
    logger.error(error);
    _this.emit('error', _session, error);
  });

  this._smtp.listen(_this.options.port, function (err) {
    if (!err) {
      logger.info('Mailin Smtp server listening on port ' + _this.options.port);
    } else {

      logger.error('Could not start server on port ' + _this.options.port + '.');
      if (_this.options.port < 1000) {
        logger.error('Ports under 1000 require root privileges.');
      }

      if (_this.options.logFile) {
        logger.error('Do you have write access to log file ' +
            _this.options.logFile + '?');
      }

      logger.error(err.message);

      callback(err);
    }
  });

  function onData(stream, session, callback){
    _session = session;

    return _this.handleData(stream, session, callback);
  }

  function onAuth(auth, session, streamCallback) {
    if (_this.emit('authorizeUser', session, auth.username, auth.password, streamCallback)) {
      streamCallback(new Error('Unauthorized user'));
    }
  }

  function onMailFrom(address, session, streamCallback) {
    var ack = function (err) {
      streamCallback(err);
    };

    _this.emit('validateSender', session, address.address, streamCallback);
    _this.validateAddress('sender', address.address, session.envelope)
      .then(ack)
      .catch(ack);
 }

 function onRcptTo(address, session, streamCallback) {
    var ack = function (err) {
      streamCallback(err);
    };

    _this.emit('validateRecipient', session, address.address, callback);
    _this.validateAddress('sender', address.address, session.envelope)
      .then(ack)
      .catch(ack);
  }

  callback();

};

Mailin.prototype.handleData = function (stream, session, callback) {
  var _this           = this;
  var connection      = _.cloneDeep(session);

  connection.id       = _this._makeId();
  connection.mailPath = path.join(_this.options.tmp, connection.id);

  logger.verbose('Connection id ' + connection.id);
  logger.info(connection.id + ' Receiving message from ' + connection.envelope.mailFrom.address);

  _this.emit('startData', connection);
  _this.emit('startMessage', connection);

  stream.pipe(fs.createWriteStream(connection.mailPath));

  stream.on('data', function (chunk) {
    _this.emit('data', connection, chunk);
  });

  stream.on('end', function () {
    logger.verbose('Data Ready');
    _this.onDataReady(connection);
    callback();
  });

  stream.on('close', function () {
    _this.emit('close', connection);
  });

  stream.on('error', function (error) {
    logger.error('error reading from file', error);
    _this.emit('error', connection, error);
  });
};

Mailin.prototype.validateAddress = function(addressType, email, envelope) {
  var _this = this;

  return new Promise(function (resolve, reject) {
    var validateEvent;
    var validationFailedEvent;
    var dnsErrorMessage;
    var localErrorMessage;

    if (_this.options.disableDnsLookup) {
      return resolve();
    }

    if (addressType === 'sender') {

      validateEvent = 'validateSender';
      validationFailedEvent = 'senderValidationFailed';
      dnsErrorMessage = '450 4.1.8 <' + email + '>: Sender address rejected: Domain not found';
      localErrorMessage = '550 5.1.1 <' + email +
        '>: Sender address rejected: User unknown in local sender table';

    } else if (addressType === 'recipient') {

      validateEvent = 'validateRecipient';
      validationFailedEvent = 'recipientValidationFailed';
      dnsErrorMessage = '450 4.1.8 <' + email + '>: Recipient address rejected: Domain not found';
      localErrorMessage = '550 5.1.1 <' + email +
        '>: Recipient address rejected: User unknown in local recipient table';

    } else {

      // How are internal errors handled?
      return reject(new Error('Address type not supported'));
    }

    if (!email) {
      return reject(new Error(localErrorMessage));
    }

    var domain = /@(.*)/.exec(email)[1];

    function validateViaLocal() {
      if (_this.listeners(validateEvent).length) {

        _this.emit(validateEvent, envelope, email, function (err) {
          if (err) {
            _this.emit(validationFailedEvent, email);
            return reject(new Error(localErrorMessage));
          } else {
            return resolve();
          }
        });

      } else {
        return resolve();
      }
    }

    function validateViaDNS() {
      try {
        dns.resolveMx(domain, function (err, addresses) {
          console.log(addresses);
          if (err || !addresses || !addresses.length) {
              _this.emit(validationFailedEvent, email);
              return reject(new Error(dnsErrorMessage));
          }

          validateViaLocal();
        });
      } catch (e) {
        return reject(e);
      }
    }

    if (_this.options.disableDNSValidation) {
      validateViaLocal();
    } else {
      validateViaDNS();
    }

  });
};

Mailin.prototype.onDataReady = function(connection, callback){
  var _this   = this;
  var report  = new MailinReport(connection, _this.options);

  logger.info('Processing message from ' + connection.from);

  /*  We need to wrap each of these functions inside of a function to make sure the
      reference to 'this' in each method is to the class it belongs to, and not
      bound to a global context */

  report.retrieveRawEmail()
    .then(function(){
      return report.validateDkim();
    })
    .then(function(){
      return report.validateSpf();
    })
    .then(function(){
      return report.computeSpamScore();
    })
    .then(function(){
      return report.parseEmail();
    })
    .then(function(){
      return report.detectLanguage();
    })
    .then(function(){
      return report.finalizeMessage();
    })
    .then(function(){
      return report.postToWebhook();
    })
    .error(function (e) {
      logger.error('an error has occured', e);
      _this.emit('error', e);
    })
    .finally(function () {

      /* Don't forget to unlink the tmp file.*/
      if(!_this.options.keepTmpFile){
        fs.unlink(report.connection.mailPath, function (err) {
            if (err) return logger.error(err);
        });
      }

      logger.info('End processing message.');

      _this.emit(
        'message',
        _.merge({}, report.connection, report.connData),
        report.results.finalizeMessage,
        report.results.rawEmail
      );

      if(callback && typeof callback === 'function'){
        callback(report.results);
      }

    });
};

Mailin.prototype.stop = function (callback) {
    callback = callback || function () {};
    logger.info('Stopping mailin.');

    this._smtp.close(callback);
    return callback(null);
};

Mailin.prototype._makeId = function () {
    return uuid.v4();
};

Mailin.prototype._makeShortId = function () {
    return this._makeId().substr(0, 8);
};


exports = module.exports = Mailin;
