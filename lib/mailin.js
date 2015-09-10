'use strict';

var FormData = require('form-data');
var LanguageDetect = require('languagedetect');
var MailParser = require('mailparser').MailParser;
var _ = require('lodash');
var htmlToText = require('html-to-text');
var crypto = require('crypto');
var events = require('events');
var fs = require('fs');
var path = require('path');
var request = require('request');
var shell = require('shelljs');
var simplesmtp = require('simplesmtp');
var util = require('util');
var mimelib = require('mimelib');

var logger = require('./logger');
var mailUtilities = require('./mailUtilities');
var Promise = require('bluebird');

function Mailin(options) {
    events.EventEmitter.call(this);

    /* Set up the default options. */
    var defaults = {
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
        verbose: false,
        debug: false,
        logLevel: 'info',
        profile: false,
        smtpOptions: {
            SMTPBanner: 'Mailin Smtp Server',
            disableDNSValidation: true,
            debug: false
        }
    };

    /* The simplesmtp server instance, 'exposed' as an undocuumented, private
     * member. It is not meant for normal usage, but is can be uuseful for
     * Mailin hacking.
     * The instance will be initialized only after that mailin.start() has been called. */
    this._smtp = null;

    options = options || {};

    this.options = _.assign({}, defaults, options);
}


function MailinReport(connection, options) {
    this.connection = connection;
    this.options = options;
    this.results = {};

    // Store connection data for later (the connection will reset)
    this.connData = _.pick(connection, ['from', 'to', 'remoteAddress', 'authentication', 'id']);
}

util.inherits(Mailin, events.EventEmitter);

Mailin.prototype.start = function (options, callback) {
    var _this = this;

    options = options || {};
    if (_.isFunction(options)) {
       callback = options;
       options = {};
    }

    this.options = _.assign({}, this.options, options);

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

        /* Enable debug for the simplesmtp server as well. */
        _this.options.smtpOptions.debug = true;
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

    var smtp = simplesmtp.createServer(_this.options.smtpOptions);

    /* Expose the smtp instance on the Mailin class. Not meant for standard uusage. */
    _this._smtp = smtp;

    smtp.on('startData', function (connection) {
        _this.emit('startData', connection);

        logger.info('Receiving message from ' + connection.from);

        /* Create a write stream to a tmp file to which the incoming mail
         * will be streamed. */
        var mailPath = path.join(_this.options.tmp, _this._makeId());
        var mailWriteStream = fs.createWriteStream(mailPath);

        connection.mailPath = mailPath;
        connection.mailWriteStream = mailWriteStream;
        connection.id = _this._makeShortId();

        logger.verbose('Connection id ' + connection.id);

        _this.emit('startMessage', connection);
    });

    smtp.on('data', function (connection, chunk) {
        _this.emit('data', connection, chunk);
        connection.mailWriteStream.write(chunk);
    });

    smtp.on('dataReady', function(connection, callback){
      logger.verbose('dataReady');
      return _this.onDataReady(connection, callback);
    });

    /* Proxy selected simplesmtp events. */
    smtp.on('authorizeUser', function (connection, username, password, callback) {
        if (!_this.emit('authorizeUser', connection, username, password, callback)) {
            callback(null, true);
        }
    });

    smtp.on('validateSender', function (connection, email, callback) {
        if (!_this.emit('validateSender', connection, email, callback)) {
            callback();
        }
    });

    smtp.on('senderValidationFailed', function (connection, email, callback) {
        if (!_this.emit('senderValidationFailed', connection, email, callback)) {
            callback();
        }
    });

    smtp.on('validateRecipient', function (connection, email, callback) {
        if (!_this.emit('validateRecipient', connection, email, callback)) {
            callback();
        }
    });

    smtp.on('recipientValidationFailed', function (connection, email, callback) {
        if (!_this.emit('recipientValidationFailed', connection, email, callback)) {
            callback();
        }
    });

    smtp.on('error', function (connection) {
        _this.emit('error', connection);
    });

    smtp.on('close', function (connection) {
        _this.emit('close', connection);
    });

    smtp.listen(_this.options.port, function (err) {
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
        }

        if(typeof callback === 'function') callback(err);
    });
};

Mailin.prototype.onDataReady = function(connection, callback){
  var _this = this;

  logger.info('Processing message from ' + connection.from);

  var report = new MailinReport(connection, _this.options);

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

        callback(report.results);
    });
};

//waits for connection
MailinReport.prototype.retrieveRawEmail = function () {
    var _this = this;

    return new Promise(function (resolve, reject) {
        fs.readFile(_this.connection.mailPath, function (err, data) {
            if (err) return reject(err);

            _this.results.rawEmail = data.toString();

            resolve(_this.results.rawEmail);
        });
    });
};

//waits for RawEmail
MailinReport.prototype.validateDkim = function () {
    var _this = this;

    var promise = new Promise(function (resolve) {

        if (_this.options.disableDkim) {
            _this.results.validateDkim = false;
            return resolve(_this.results.validateDkim);
        }

        logger.verbose('Validating dkim.');
        mailUtilities.validateDkim(_this.results.rawEmail, function (err, isDkimValid) {
            if (err) {
                logger.error('Unable to validate dkim. Consider dkim as failed.');
                logger.error(err);
                _this.results.validateDkim = false;
            } else {
                _this.results.validateDkim = isDkimValid;
            }

            resolve(_this.results.validateDkim);
        });
    });

    return promise;
};

//waits for connection
MailinReport.prototype.validateSpf = function () {

    var _this = this;

    return new Promise(function (resolve) {

        if (_this.options.disableSpf) {
            _this.results.validateSpf = false;
            return resolve(_this.results.validateSpf);
        }

        logger.verbose('Validating spf.');

        /* Get ip and host. */
        mailUtilities.validateSpf(_this.connection.remoteAddress,
            _this.connection.from, _this.connection.host, function (err, isSpfValid) {
                if (err) {
                    logger.error('Unable to validate spf. Consider spf as failed.');
                    logger.error(err);
                    _this.results.validateSpf = false;

                } else {
                    _this.results.validateSpf = isSpfValid;
                }

                resolve(_this.results.validateSpf);
            });
    });
};

//waits for RawEmail
MailinReport.prototype.computeSpamScore = function () {

    var _this = this;

    return new Promise(function (resolve) {

        if (_this.options.disableSpamScore) {
            _this.results.computeSpamScore = 0.0;
            return resolve(_this.results.computeSpamScore);
        }

        logger.verbose('Computing spam score.');
        mailUtilities.computeSpamScore(_this.rawEmail, function (err, spamScore) {
            if (err) {
                logger.error('Unable to compute spam score. Set spam score to 0.');
                logger.error(err);
                _this.results.computeSpamScore = 0.0;
            } else {
                _this.results.computeSpamScore = spamScore;
            }

            logger.verbose('Spam score: ' + _this.results.computeSpamScore);

            resolve(_this.results.computeSpamScore);
        });
    });
};

//waits for connection
MailinReport.prototype.parseEmail = function () {
    var _this = this;

    return new Promise(function (resolve) {

        if(_this.options.disableEmailParsing){
          _this.results.parseEmail = _this.parseEmail = false;

          return resolve(_this.parseEmail);
        }

        logger.verbose('Parsing email.');

        /* Prepare the mail parser. */
        var mailParser = new MailParser();
        mailParser.on('end', function (mail) {
            // logger.verbose(util.inspect(mail, {
            // depth: 5
            // }));

            /* Make sure that both text and html versions of the
             * body are available. */
            if (!mail.text && !mail.html) {
                mail.text = '';
                mail.html = '<div></div>';
            } else if (!mail.html) {
                mail.html = _this._convertTextToHtml(mail.text);
            } else if (!mail.text) {
                mail.text = _this._convertHtmlToText(mail.html);
            }

            _this.results.parseEmail = _this.parseEmail = mail;

            return resolve(_this.parseEmail);
        });

        mailParser.on('error', function (err) {
            logger.error('Error while parsing the email');
            logger.error(err);
            _this.results.parseEmail = _this.parseEmail = false;

            return resolve(_this.parseEmail);
        });

        /* Stream the written email to the parser. */
        var mailReadStream = fs.createReadStream(_this.connection.mailPath);
        mailReadStream.pipe(mailParser);
    });

};

MailinReport.prototype.detectLanguage = function () {
    var _this = this;

    return new Promise(function (resolve) {
        if (_this.options.disableLanguageDetection || !_this.parseEmail || _this.options.disableEmailParsing) {
            _this.results.detectLanguage = '';
            return resolve(_this.results.detectLanguage);
        }

        logger.verbose('Detecting language.');
        var text = _this.parseEmail.text;

        if (!text || !_.isString(text)) {
          _this.results.detectLanguage = '';
          return resolve(_this.results.detectLanguage);
        }

        var language = '';
        var languageDetector = new LanguageDetect();
        var potentialLanguages = languageDetector.detect(text, 2);
        if (potentialLanguages.length !== 0) {
            logger.verbose('Potential languages: ' + util.inspect(potentialLanguages, {
                depth: 5
            }));

            /* Use the first detected language.
             * potentialLanguages = [['english', 0.5969], ['hungarian', 0.40563]] */
            language = potentialLanguages[0][0];
        } else {
            logger.info('Unable to detect language for the current message.');
        }

        _this.results.detectLanguage = language;

        resolve(_this.results.detectLanguage);
    });
};

//waits for all things
MailinReport.prototype.finalizeMessage = function () {
    var _this = this;

    return new Promise(function (resolve) {

        //if(!_this.results.parseEmail) return reject('error parsing message');

        var isDkimValid = _this.results.validateDkim;
        var isSpfValid = _this.results.validateSpf;
        var spamScore = _this.results.computeSpamScore;
        var parsedEmail = _this.results.parseEmail || {};
        var language = _this.results.detectLanguage;

        /* Finalize the parsed email object. */
        parsedEmail.dkim = isDkimValid ? 'pass' : 'failed';
        parsedEmail.spf = isSpfValid ? 'pass' : 'failed';
        parsedEmail.spamScore = spamScore;
        parsedEmail.language = language;

        /* Make fields exist, even if empty. That will make
         * json easier to use on the webhook receiver side. */
        parsedEmail.cc = parsedEmail.cc || [];
        parsedEmail.attachments = parsedEmail.attachments || [];


        /* Add the connection authentication to the parsedEmail. */
        parsedEmail.connection = _this.connData;

        _this.results.finalizeMessage = parsedEmail;

        /* Add envelope data to the parsedEmail. */
        _this.results.finalizeMessage.envelopeFrom = mimelib.parseAddresses(_this.connData.from);
        _this.results.finalizeMessage.envelopeTo = mimelib.parseAddresses(_this.connData.to);

        resolve(_this.results.finalizeMessage);
    });
};

MailinReport.prototype.postToWebhook = function () {

    var _this = this;

    return new Promise(function (resolve) {
        if (_this.options.disableWebhook) return resolve(null);

        logger.info('Sending request to webhook ' + _this.options.webhook);
        var finalizedMessage = _this.results.finalizeMessage;

        /* Convert the attachments contents from Buffer to
         * base64 encoded strings and remove them from the
         * message. They will be posted as multipart of a form
         * as key values pairs (attachmentName, attachmentContent). */
        logger.profile('Convert attachments to strings');
        var attachmentNamesAndContent = {};
        finalizedMessage.attachments.forEach(function (attachment) {
            attachmentNamesAndContent[attachment.generatedFileName] = attachment.content.toString('base64');
            delete attachment.content;
        });

        /* Send the request to the webhook. This is a bit
         * convoluted way of posting a multipart form, but it
         * seems to be the only working pattern (see
         * https://github.com/mikeal/request/issues/316). */
        var form = new FormData();
        form.append('mailinMsg', JSON.stringify(finalizedMessage));
        for (var attachmentName in attachmentNamesAndContent) {
            if (attachmentNamesAndContent.hasOwnProperty(attachmentName)) {
                form.append(attachmentName, attachmentNamesAndContent[attachmentName]);
            }
        }

        form.getLength(function (err, length) {
            logger.verbose('Webhook length: ' + length / 1000000 + 'mb');

            var headers = form.getHeaders();
            headers['Content-Length'] = length;

            var r = request.post({
                url: _this.options.webhook,
                timeout: 30000,
                headers: headers
            }, function (err, resp, body) {
                /* Avoid memory leak by hinting the gc. */
                finalizedMessage = null;
                attachmentNamesAndContent = null;

                if (err || resp.statusCode !== 200) {
                    logger.warn('Error in posting to webhook ' + _this.options.webhook);
                    if (resp) logger.warn('Response status code: ' + resp.statusCode);
                    return resolve(null);
                }

                logger.info('Succesfully posted to webhook ' + _this.options.webhook);
                logger.verbose(body);
                return resolve(null);
            });

            r._form = form;
        });
    });
};

Mailin.prototype.stop = function (callback) {
    callback = callback || function () {};
    logger.info('Stopping mailin.');

    /* FIXME A bug in the RAI module prevents the callback to be called, so
     * call end and call the callback directly. */
    this._smtp.end(function () {});
    return callback(null);
};

Mailin.prototype._makeId = function () {
    return crypto.randomBytes(20).toString('hex');
};

Mailin.prototype._makeShortId = function () {
    return this._makeId().substr(0, 8);
};

MailinReport.prototype._convertTextToHtml = function (text) {
    /* Replace newlines by <br>. */
    text = text.replace(/(\n\r)|(\n)/g, '<br>');
    /* Remove <br> at the begining. */
    text = text.replace(/^\s*(<br>)*\s*/, '');
    /* Remove <br> at the end. */
    text = text.replace(/\s*(<br>)*\s*$/, '');

    return text;
};

MailinReport.prototype._convertHtmlToText = function (html) {
    return htmlToText.fromString(html);
};

exports = module.exports = Mailin;
