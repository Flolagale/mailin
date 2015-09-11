'use strict';

var fs              = require('fs');
var util            = require('util');

var Promise         = require('bluebird');
var _               = require('lodash');

var MailParser      = require('mailparser').MailParser; //read email from file
var LanguageDetect  = require('languagedetect');
var request         = require('superagent');             //webhook
var htmlToText      = require('html-to-text');

var logger          = require('./logger');
var mailUtilities   = require('./mailUtilities');

function MailinReport(connection, options) {
    this.connection = connection;
    this.options = options;
    this.results = {};

    // Store connection data for later (the connection will reset)
    this.connData = _.pick(connection, ['from', 'to', 'remoteAddress', 'authentication', 'id']);
}

//waits for connection
MailinReport.prototype.retrieveRawEmail = function () {
  var _this = this;

  return new Promise(function (resolve, reject) {
    fs.readFile(
      _this.connection.mailPath,
      fileHandler
    );

    function fileHandler(err, data) {
      if (err) return reject(err);

      _this.results.rawEmail = data.toString();

      resolve(_this.results.rawEmail);
    }
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

    mailUtilities.validateDkim(
      _this.results.rawEmail,
      dkimResultsHandler
    );

    function dkimResultsHandler(err, isDkimValid) {
      if (err) {
        logger.error('Unable to validate dkim. Consider dkim as failed.');
        logger.error(err);
        _this.results.validateDkim = false;
      } else {
        _this.results.validateDkim = isDkimValid;
      }

      resolve(_this.results.validateDkim);
    }
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

    var remoteAddress;
    var from;
    var host;

    /* Get ip and host. */
    mailUtilities.validateSpf(
      _this.connection.remoteAddress,
      _this.connection.from,
      _this.connection.host,
      spfResultsHandler
    );

    function spfResultsHandler(err, isSpfValid) {
      if (err) {
        logger.error('Unable to validate spf. Consider spf as failed.');
        logger.error(err);

        _this.results.validateSpf = false;
      } else {
        _this.results.validateSpf = isSpfValid;
      }

      resolve(_this.results.validateSpf);
    }
  });
};

//waits for connection and parsedEmail
MailinReport.prototype.computeSpamScore = function () {

  var _this = this;

  return new Promise(function (resolve) {

    if (_this.options.disableSpamScore) {
      _this.results.computeSpamScore = 0.0;
      return resolve(_this.results.computeSpamScore);
    }

    logger.verbose('Computing spam score.');

    mailUtilities.computeSpamScore(
      _this.parseEmail,
      spamScoreHandler
    );

    function spamScoreHandler(err, spamScore) {
      if (err) {
        logger.error('Unable to compute spam score. Set spam score to 0.');
        logger.error(err);

        _this.results.computeSpamScore = 0.0;
      } else {
        _this.results.computeSpamScore = spamScore;
      }

      logger.verbose('Spam score: ' + _this.results.computeSpamScore);

      resolve(_this.results.computeSpamScore);
    }
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

    mailParser.on('end', parseEmailHandler);
    mailParser.on('error', errorHandler);

    /* Stream the written email to the parser. */
    fs.createReadStream(_this.connection.mailPath).pipe(mailParser);

    function errorHandler (err) {
      logger.error('Error while parsing the email');
      logger.error(err);

      _this.results.parseEmail = _this.parseEmail = false;

      return resolve(_this.parseEmail);
    }

    function parseEmailHandler (mail) {

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
    }

  });

};

MailinReport.prototype.detectLanguage = function () {
    var _this = this;

    return new Promise(function (resolve) {

      if (_this.options.disableLanguageDetection || _this.options.disableEmailParsing) {
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

    if (_this.connection.envelope) {
      /* Add envelope data to the parsedEmail. */
      _this.results.finalizeMessage.envelopeFrom  = _this.connection.envelope.mailFrom;
      _this.results.finalizeMessage.envelopeTo    = _this.connection.envelope.rcptTo;
    } else {
      logger.error('No Envelope Data in connection');
    }

    resolve(_this.results.finalizeMessage);
  });
};

MailinReport.prototype.postToWebhook = function () {

  var _this = this;

  return new Promise(function (resolve) {
    if (_this.options.disableWebhook) return resolve(null);

    var finalizedMessage          = _this.results.finalizeMessage;
    var attachments = {};

    logger.info(_this.connection.id + ' Sending request to webhook ' + _this.options.webhook);

    /* Convert the attachments contents from Buffer to
     * base64 encoded strings and remove them from the
     * message. They will be posted as multipart of a form
     * as key values pairs (attachmentName, attachmentContent). */

    logger.verbose('Convert attachments to strings');

    finalizedMessage.attachments.forEach(function (attachment) {
        attachments[attachment.generatedFileName] = attachment.content.toString('base64');
        delete attachment.content;
    });

    logger.verbose('Finished Convert attachments to strings');

    //logger.verbose(finalizedMessage);

    var req = request.post(_this.options.webhook);
    req.field('mailinMsg', JSON.stringify(finalizedMessage));

    _.forEach(attachments, function (content, name) {
        req.field(name, content);
    });

    req.end(webhookResponseHandler);

    function webhookResponseHandler (err, resp) {
      /* Avoid memory leak by hinting the gc. */

      if (err || resp.statusCode !== 200) {
        logger.error(_this.connection.id + ' Error in posting to webhook ' + _this.options.webhook);

        if (resp) {
          logger.error(_this.connection.id + ' Response status code: ' + resp.statusCode);
        }

        return resolve();
      }

      logger.info(_this.connection.id + ' Succesfully posted to webhook ' + _this.options.webhook);
      logger.debug(resp.text);
      return resolve();
    }
  });
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

exports = module.exports = MailinReport;
