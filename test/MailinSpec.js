/* jshint expr: true */
'use strict';

var express = require('express');
var fs = require('fs');
var mailin = require('../lib/mailin');
var simplesmtp = require('simplesmtp');

var should = null;
should = require('should');

before(function (done) {
    mailin.start(function (err) {
        should.not.exist(err);
        done();
    });
});

describe('Mailin', function () {
    it('should post a json to a webhook after receiving an email', function (done) {
        this.timeout(10000);

        /* Make an http server to receive the webhook. */
        var server = express();
        server.use(express.bodyParser());
        server.use(server.router);
        server.head('/webhook', function (req, res) {
            res.send(200);
        });
        server.post('/webhook', function (req, res) {
            console.log('Receiving webhook.');

            /* Delete the headers that include a timestamp. */
            delete req.body.mailinMsg.headers.received;
            delete req.body.mailinMsg.attachments[0].content;

            req.body.should.eql({
                mailinMsg: {
                    html: '<b>Hello world!</b>',
                    text: 'Hello world!',
                    headers: {
                        'x-mailer': 'Nodemailer 1.0',
                        from: 'andris@tr.ee',
                        to: 'andris@node.ee',
                        'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1395066415427"',
                        'mime-version': '1.0'
                    },
                    priority: 'normal',
                    from: [{
                        address: 'andris@tr.ee',
                        name: ''
                    }],
                    to: [{
                        address: 'andris@node.ee',
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
                    }]
                }
            });

            res.send(200);
            done();
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
                    from: 'me@example.com',
                    to: ['receiver1@example.com', 'receiver2@example.com']
                });
            });

            client.on('message', function () {
                fs.createReadStream('./test/fixtures/test.eml').pipe(client);
            });
        });
    });
});
