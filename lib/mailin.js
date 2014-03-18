'use strict';

var async = require('async');
var MailParser = require('mailparser').MailParser;
var crypto = require('crypto');
var dkimService = require('./dkimService');
var fs = require('fs');
var path = require('path');
var request = require('request');
var simplesmtp = require('simplesmtp');
var util = require('util');
var _ = require('lodash');

var mailin = {
    start: function (options, callback) {
        options = options || {};
        if (_.isFunction(options)) {
            callback = options;
            options = {};
        }

        options = _.defaults(options, {
            port: 2500,
            tmp: '.tmp',
            webhook: 'http://localhost:3000/webhook'
        });
        callback = callback || function () {};

        /* Create tmp dir if necessary. */
        if (!fs.existsSync(options.tmp)) {
            fs.mkdirSync(options.tmp);
        }

        simplesmtp.createSimpleServer({
            SMTPBanner: 'Mailin Smtp Server',
            // debug: true
        }, function (req) {
            console.log('Receiving message from ' + req.from);

            req.once('end', function () {
                console.log('End of message from ' + req.from);
            });

            /* Create a write stream to a tmp file to which the incoming mail
             * will be streamed. */
            var mailPath = path.join(options.tmp, mailin.makeId());
            var mailWriteStream = fs.createWriteStream(mailPath);

            mailWriteStream.on('finish', function () {
                async.auto({
                    validateDkim: function (cbAuto) {
                        /* Check dkim. */
                        fs.readFile(mailPath, function (err, data) {
                            dkimService.validateDkim(data.toString(), cbAuto);
                        });
                    },

                    parseEmail: function (cbAuto) {
                        /* Prepare the mail parser. */
                        var mailParser = new MailParser();
                        mailParser.on('end', function (mail) {
                            console.log(util.inspect(mail, {
                                depth: 5
                            }));

                            cbAuto(null, mail);
                        });

                        /* Stream the written email to the parser. */
                        var mailReadStream = fs.createReadStream(mailPath);
                        mailReadStream.pipe(mailParser);
                    },

                    sendRequestToWebhook: ['validateDkim', 'parseEmail', function (cbAuto, results) {
                        var isDkimValid = results.validateDkim;
                        var parsedEmail = results.parseEmail;

                        parsedEmail.isDkimValid = isDkimValid;

                        /* Send the request to the webhook. */
                        request.post(options.webhook).form({
                            mailinMsg: parsedEmail
                        }, function (err, resp, body) {
                            if (err || resp.statusCode !== 200) {
                                console.log('Error in posting to webhook ' + options.webhook);
                                console.log('Response status code: ' + resp.statusCode);
                                return cbAuto(err);
                            }

                            console.log('Succesfully post to webhook ' + options.webhook);
                            console.log(body);
                            return cbAuto(null);
                        });
                    }]
                }, function (err) {
                    if (err) console.log(err);

                    /* Don't forget to unlink the tmp file. */
                    fs.unlink(mailPath, function (err) {
                        if (err) console.log(err);
                    });

                    console.log('End processing message.');
                });
            });

            req.pipe(mailWriteStream);

            /* Finally accept the incoming email. */
            req.accept(mailin.makeId());

        }).listen(options.port, function (err) {
            if (!err) {
                console.log('Mailin Smtp server listening on port ' + options.port);
            } else {
                console.log('Could not start server on port ' + options.port + '.');
                if (options.port < 1000) {
                    console.log('Ports under 1000 require root privileges.');
                }

                console.log(err.message);
            }

            callback(err);
        });
    },

    makeId: function () {
        return crypto.randomBytes(20).toString('hex');
    }
};

module.exports = mailin;
