'use strict';

var FormData = require('form-data');
var LanguageDetect = require('languagedetect');
var MailParser = require('mailparser').MailParser;
var _ = require('lodash');
var async = require('async');
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

var detectEncoding = require('detect-encoding');
var Iconv = require('iconv').Iconv;

var Mailin = function () {
    events.EventEmitter.call(this);

    /* Set up the default options. */
    this.options = {
        port: 2500,
        tmp: '.tmp',
        webhook: 'http://localhost:3000/webhook',
        disableWebhook: false,
        logFile: null,
        disableDkim: false,
        disableSpf: false,
        disableSpamScore: false,
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
};
util.inherits(Mailin, events.EventEmitter);

Mailin.prototype.start = function (options, callback) {
    var _this = this;

    options = options || {};
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }

    this.options = _.defaults(options, this.options);

    callback = callback || function () {};

    /* Create tmp dir if necessary. */
    if (!fs.existsSync(this.options.tmp)) {
        shell.mkdir('-p', this.options.tmp);
    }

    /* Log to a file if necessary. */
    if (this.options.logFile) {
        logger.setLogFile(this.options.logFile);
    }

    /* Set log level if necessary. */
    if (this.options.logLevel) {
        logger.setLevel(this.options.logLevel);
    }

    if (this.options.verbose) {
        logger.setLevel('verbose');
        logger.info('Log level set to verbose.');
    }

    if (this.options.debug) {
        logger.info('Debug option activated.');
        logger.setLevel('debug');

        /* Enable debug for the simplesmtp server as well. */
        this.options.smtpOptions.debug = true;
    }

    /* Basic memory profiling. */
    if (this.options.profile) {
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
    if (!this.options.disableWebhook) {
        request.head({
            url: this.options.webhook,
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

    var smtp = simplesmtp.createServer(this.options.smtpOptions);

    /* Expose the smtp instance on the Mailin class. Not meant for standard uusage. */
    this._smtp = smtp;

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

    smtp.on('dataReady', function (connection, callback) {
        logger.info('Processing message from ' + connection.from);

        // Store connection data for later (the connection will reset)
        var connData = _.pick(connection, ['from', 'to', 'remoteAddress', 'authentication', 'id']);

        async.auto({
                retrieveRawEmail: function (cbAuto) {
                    fs.readFile(connection.mailPath, function (err, buf) {
                        if (err) return cbAuto(err);

												logger.verbose('Detecting encoding');

												detectEncoding(buf, function(err, encoding) {
														if (err) {
															var str = buf.toString();
															logger.info('Unable to detect encoding for the current message. Consider encoding as UTF-8.')
														} else {
															// Fix EUC-KR related bug; EUC-KR is incomplete subset of CP949
															if(encoding == 'EUC-KR'){
																encoding = 'CP949';
															}

															logger.verbose('Detected encoding: ' + encoding);

															var iconv = new Iconv(encoding, 'UTF-8');
															var str = iconv.convert(buf).toString();
														}

														cbAuto(null, str);
												});
                    });
                },

                validateDkim: ['retrieveRawEmail',
                    function (cbAuto, results) {
                        if (_this.options.disableDkim) return cbAuto(null, false);

                        logger.verbose('Validating dkim.');
                        var rawEmail = results.retrieveRawEmail;
                        mailUtilities.validateDkim(rawEmail, function (err, isDkimValid) {
                            if (err) {
                                logger.error('Unable to validate dkim. Consider dkim as failed.');
                                logger.error(err);
                                return cbAuto(null, false);
                            }

                            cbAuto(null, isDkimValid);
                        });
                    }
                ],

                validateSpf: function (cbAuto) {
                    if (_this.options.disableSpf) return cbAuto(null, false);

                    logger.verbose('Validating spf.');
                    /* Get ip and host. */
                    mailUtilities.validateSpf(connection.remoteAddress,
                        connection.from, connection.host, function (err, isSpfValid) {
                            if (err) {
                                logger.error('Unable to validate spf. Consider spf as failed.');
                                logger.error(err);
                                return cbAuto(null, false);
                            }

                            cbAuto(null, isSpfValid);
                        });
                },

                computeSpamScore: ['retrieveRawEmail',
                    function (cbAuto, results) {
                        if (_this.options.disableSpamScore) return cbAuto(null, 0.0);

                        logger.verbose('Computing spam score.');
                        var rawEmail = results.retrieveRawEmail;
                        mailUtilities.computeSpamScore(rawEmail, function (err, spamScore) {
                            if (err) {
                                logger.error('Unable to compute spam score. Set spam score to 0.');
                                logger.error(err);
                                return cbAuto(null, 0.0);
                            }

                            logger.verbose('Spam score: ' + spamScore);
                            cbAuto(null, spamScore);
                        });
                    }
                ],

                parseEmail: ['retrieveRawEmail',
										function (cbAuto, results) {
		                    logger.verbose('Parsing email.');
    		                /* Prepare the mail parser. */
        		            var mailParser = new MailParser({ defaultCharset: 'UTF-8' });
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

		                        cbAuto(null, mail);
		                    });

		                    /* Stream the written email to the parser. */
												mailParser.end(results.retrieveRawEmail);
										}
								],

                detectLanguage: ['parseEmail',
                    function (cbAuto, results) {
                        logger.verbose('Detecting language.');
                        var text = results.parseEmail.text;

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

                        cbAuto(null, language);
                    }
                ],

                finalizeMessage: ['retrieveRawEmail', 'validateDkim', 'validateSpf', 'computeSpamScore',
                    'parseEmail', 'detectLanguage',
                    function (cbAuto, results) {
                        var rawEmail = results.retrieveRawEmail;
                        var isDkimValid = results.validateDkim;
                        var isSpfValid = results.validateSpf;
                        var spamScore = results.computeSpamScore;
                        var parsedEmail = results.parseEmail;
                        var language = results.detectLanguage;

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
                        parsedEmail.connection = connData;

                        /* Add envelope data to the parsedEmail. */
                        parsedEmail.envelopeFrom = mimelib.parseAddresses(connData.from);
                        parsedEmail.envelopeTo = mimelib.parseAddresses(connData.to);

                        _this.emit('message', _.merge({}, connection, connData), parsedEmail, rawEmail);

                        cbAuto(null, parsedEmail);
                    }
                ],

                postToWebhook: ['finalizeMessage',
                    function (cbAuto, results) {
                        if (_this.options.disableWebhook) return cbAuto(null);

                        logger.info('Sending request to webhook ' + _this.options.webhook);
                        var finalizedMessage = results.finalizeMessage;

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
                        logger.profile('Convert attachments to strings');

                        logger.verbose(finalizedMessage);

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
                                    return cbAuto(null);
                                }

                                logger.info('Succesfully posted to webhook ' + _this.options.webhook);
                                logger.verbose(body);
                                return cbAuto(null);
                            });

                            r._form = form;
                        });
                    }
                ]
            },
            function (err) {
                if (err) return logger.error(err);

                /* Don't forget to unlink the tmp file. */
                fs.unlink(connection.mailPath, function (err) {
                    if (err) return logger.error(err);
                });

                logger.info('End processing message.');
            });

        /* Close the connection. */
        if (!_this.emit('dataReady', connection, callback)) {
            callback();
        }
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

        callback(err);
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

Mailin.prototype._convertTextToHtml = function (text) {
    /* Replace newlines by <br>. */
    text = text.replace(/(\n\r)|(\n)/g, '<br>');
    /* Remove <br> at the begining. */
    text = text.replace(/^\s*(<br>)*\s*/, '');
    /* Remove <br> at the end. */
    text = text.replace(/\s*(<br>)*\s*$/, '');

    return text;
};

Mailin.prototype._convertHtmlToText = function (html) {
    return htmlToText.fromString(html);
};

module.exports = new Mailin();