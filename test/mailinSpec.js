/* jshint expr: true */
'use strict';

var express = require('express');
var fs = require('fs');
var mailin = require('../lib/mailin');
var multiparty = require('multiparty');
var simplesmtp = require('simplesmtp');
var shell = require('shelljs');

var should = null;
should = require('should');

before(function (done) {
    mailin.start({
        verbose: true,
    }, function (err) {
        should.not.exist(err);
        done();
    });
});

describe('Mailin', function () {
    it('should post a json to a webhook after receiving an email and trigger some events', function (done) {
        this.timeout(10000);

        var expectedSpamScore = 3.3;
        if (!shell.which('spamassassin') || !shell.which('spamc')) {
            console.warn('Spamassassin is not installed. Skipping spam score test.');
            expectedSpamScore = 0;
        }

        /* Add listeners to the events. */
        var connectionId = null;
        mailin.on('startMessage', function (messageInfo) {
            console.log("Event 'startMessage' triggered.");
            console.log(messageInfo);
            connectionId = messageInfo.connectionId;
        });

        mailin.on('message', function (message) {
            console.log("Event 'message' triggered.");
            console.log(message);

            message.attachments[0].content.toString().should.eql('my dummy attachment contents');

            /* Delete the headers that include a timestamp. */
            delete message.headers.received;

            message.should.eql({
                html: '<b>Hello world!</b>',
                text: 'Hello world!',
                headers: {
                    'x-mailer': 'Nodemailer 1.0',
                    from: '"Me" <me@jokund.com>',
                    to: '"First Receiver" <first@jokund.com>, second@jokund.com',
                    'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1402581589619"',
                    'mime-version': '1.0'
                },
                priority: 'normal',
                from: [{
                    address: 'me@jokund.com',
                    name: 'Me'
                }],
                to: [{
                    address: 'first@jokund.com',
                    name: 'First Receiver'
                }, {
                    address: 'second@jokund.com',
                    name: ''
                }],
                attachments: [{
                    contentType: 'text/plain',
                    fileName: 'dummyFile.txt',
                    contentDisposition: 'attachment',
                    transferEncoding: 'base64',
                    generatedFileName: 'dummyFile.txt',
                    contentId: '6e4a9c577e603de61e554abab84f6297@mailparser',
                    checksum: 'e9fa6319356c536b962650eda9399a44',
                    length: 28,
                    content: new Buffer('my dummy attachment contents'),
                    // contents: [
                    // 109,
                    // 121,
                    // 32,
                    // 100,
                    // 117,
                    // 109,
                    // 109,
                    // 121,
                    // 32,
                    // 97,
                    // 116,
                    // 116,
                    // 97,
                    // 99,
                    // 104,
                    // 109,
                    // 101,
                    // 110,
                    // 116,
                    // 32,
                    // 99,
                    // 111,
                    // 110,
                    // 116,
                    // 101,
                    // 110,
                    // 116,
                    // 115
                    // ]
                }],
                dkim: 'failed',
                envelopeFrom: [{
                    address: "envelopefrom@jokund.com",
                    name: ""
                }],
                envelopeTo: [{
                    address: "envelopeto@jokund.com",
                    name: ""
                }],
                spf: 'failed',
                spamScore: expectedSpamScore,
                language: 'pidgin',
                cc: [],
                connectionId: connectionId
            });

            // done();
        });

        /* Make an http server to receive the webhook. */
        var server = express();
        server.use(server.router);
        server.head('/webhook', function (req, res) {
            res.send(200);
        });
        server.post('/webhook', function (req, res) {
            console.log('Receiving webhook.');

            var form = new multiparty.Form();
            form.parse(req, function (err, fields, files) {
                if (err) console.log(err.stack);
                should.not.exist(err);

                should.exist(files);
                Object.keys(files).length.should.eql(0);

                should.exist(fields);
                should.exist(fields.mailinMsg);
                should.exist(fields['dummyFile.txt']);

                var mailinMsg = JSON.parse(fields.mailinMsg);

                /* Delete the headers that include a timestamp. */
                delete mailinMsg.headers.received;

                /* And the connection id, which is random. */
                delete mailinMsg.connectionId;

                mailinMsg.should.eql({
                    html: '<b>Hello world!</b>',
                    text: 'Hello world!',
                    headers: {
                        'x-mailer': 'Nodemailer 1.0',
                        from: '"Me" <me@jokund.com>',
                        to: '"First Receiver" <first@jokund.com>, second@jokund.com',
                        'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1402581589619"',
                        'mime-version': '1.0'
                    },
                    priority: 'normal',
                    from: [{
                        address: 'me@jokund.com',
                        name: 'Me'
                    }],
                    to: [{
                        address: 'first@jokund.com',
                        name: 'First Receiver'
                    }, {
                        address: 'second@jokund.com',
                        name: ''
                    }],
                    attachments: [{
                        contentType: 'text/plain',
                        fileName: 'dummyFile.txt',
                        contentDisposition: 'attachment',
                        transferEncoding: 'base64',
                        generatedFileName: 'dummyFile.txt',
                        contentId: '6e4a9c577e603de61e554abab84f6297@mailparser',
                        checksum: 'e9fa6319356c536b962650eda9399a44',
                        length: '28'
                    }],
                    dkim: 'failed',
                    envelopeFrom: [{
                        address: 'envelopefrom@jokund.com',
                        name: ''
                    }],
                    envelopeTo: [{
                        address: 'envelopeto@jokund.com',
                        name: ''
                    }],
                    spf: 'failed',
                    spamScore: expectedSpamScore,
                    language: 'pidgin',
                    cc: []
                });

                res.send(200);

                /* Hacky timeout to make sure that the events had the time to be
                 * triggered and handled. */
                setTimeout(function () {
                    done();
                }, 1000);
            });
        });
        server.listen(3000, function (err) {
            if (err) console.log(err);
            should.not.exist(err);

            console.log('Http server listening on port 3000');

            /* Make an smtp client to send an email. */
            var client = simplesmtp.connect(2500);

            /* Run only once as 'idle' is emitted again after message delivery. */
            client.once('idle', function () {
                client.useEnvelope({
                    from: 'envelopefrom@jokund.com',
                    to: 'envelopeto@jokund.com'
                });
            });

            client.on('message', function () {
                fs.createReadStream('./test/fixtures/test.eml').pipe(client);
            });
        });
    });
});
