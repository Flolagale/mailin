/* jshint expr: true */
'use strict';

var _ = require('lodash');
var express = require('express');
var fs = require('fs');
var mailin = require('../lib/mailin');
var multiparty = require('multiparty');
var SMTPConnection = require('smtp-connection');
var shell = require('shelljs');

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

var should = null;
should = chai.Should();

var server = express(),
    conn;
var doing = 0;

before(function (done) {
    /* Make an http server to receive the webhook. */
    server.head('/webhook', function (req, res) {
        res.send(200);
        doing--;
    });

    conn = server.listen(3000, function (err) {
        if (err) console.log(err);
        should.not.exist(err);

        console.log('Http server listening on port 3000');

        // This checks the webhook; that's why the server must be already up and listening
        mailin.start({
            // verbose: true,
            smtpOptions: {
                secure: false
            }
        }, function (err) {
            should.not.exist(err);
            done();
        });

    });
});

beforeEach(function () {
    mailin.removeAllListeners();
});

describe('Mailin', function () {
    it('should post a json to a webhook after receiving an email and trigger some events', function (done) {
        this.timeout(30000);

        doing += 4; // Number of async operations we need to wait for before calling done

        var expectedSpamScore = 3.3;
        if (!shell.which('spamassassin') || !shell.which('spamc')) {
            console.warn('Spamassassin is not installed. Skipping spam score test.');
            expectedSpamScore = 0;
        }

        /* Add listeners to the events. */
        var connData = null;
        mailin.on('startMessage', function (connection) {
            console.log("Event 'startMessage' triggered.");
            connData = _.cloneDeep(connection);
            console.log(connData);
            should.exist(connData.id);
            doing--;
        });

        mailin.on('message', function (connection, data) {
            console.log("Event 'message' triggered.");
            // console.log(data);
            try {

                data.attachments[0].content.toString().should.eql('my dummy attachment contents');

                /* Delete the headers that include a timestamp. */
                delete data.headers.received;

                data.should.eql({
                    html: '<b>Hello world!</b>',
                    text: 'Hello world!',
                    headers: {
                        'x-mailer': 'Nodemailer 1.0',
                        'from': '\"Me\" <me@jokund.com>',
                        'to': '\"First Receiver\" <first@jokund.com>, second@jokund.com',
                        'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1402581589619"',
                        'mime-version': '1.0'
                    },
                    priority: 'normal',
                    receivedDate: '2016-12-02T17:41:31.000Z',
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
                        content: new Buffer('my dummy attachment contents')
                    }],
                    dkim: 'failed',
                    envelopeFrom: {
                        address: "envelopefrom@jokund.com",
                        args: false
                    },
                    envelopeTo: [{
                        address: "envelopeto@jokund.com",
                        args: false
                    }],
                    spf: 'failed',
                    spamScore: expectedSpamScore,
                    language: 'pidgin',
                    mailHops: null,
                    cc: [],
                    connection: connData
                });

                doing--;
            } catch (e) {
                done(e);
            }
        });



        server.post('/webhook', function (req, res) {
            console.log('Receiving webhook.');

            var form = new multiparty.Form();
            form.parse(req, function (err, fields, files) {
                try {
                    if (err) console.log(err.stack);
                    should.not.exist(err);

                    should.exist(files);
                    Object.keys(files).length.should.eql(0);

                    should.exist(fields);
                    fields.should.have.property('mailinMsg');
                    fields.should.have.property('dummyFile.txt');

                    var mailinMsg = JSON.parse(fields.mailinMsg);

                    /* Delete the headers that include a timestamp. */
                    delete mailinMsg.headers.received;

                    /* And the connection id, which is random. */
                    delete mailinMsg.data;

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
                        receivedDate: '2016-12-02T17:41:31.000Z',
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
                            length: 28
                        }],
                        dkim: 'failed',
                        envelopeFrom: {
                            address: 'envelopefrom@jokund.com',
                            args: false
                        },
                        envelopeTo: [{
                            address: 'envelopeto@jokund.com',
                            args: false
                        }],
                        spf: 'failed',
                        spamScore: expectedSpamScore,
                        language: 'pidgin',
                        mailHops: null,
                        cc: [],
                        connection: connData
                    });

                    res.sendStatus(200);

                    doing--;
                } catch (e) {
                    done(e);
                }
            });

            var waiting = setInterval(function () {
                if (!doing) {
                    clearInterval(waiting);
                    conn.close();
                    done();
                }
            }, 1000);
        });


        /* Make an smtp client to send an email. */
        var client = new SMTPConnection({
            port: 2500,
            ignoreTLS: true
        });

        client.connect(function () {
            client.send({
                from: {
                    name: '',
                    address: 'envelopefrom@jokund.com'
                },
                to: [{
                    name: '',
                    address: 'envelopeto@jokund.com'
                }]
            }, fs.createReadStream('./test/fixtures/test.eml'), function (err) {
                if (err) {
                    done(err);
                }
            });
        });

    });

    it('should convert an HTML-only message to text', function (done) {
        this.timeout(10000);

        mailin.on('message', function (connection, data) {
            // console.log(data);
            try {
                data.text.should.eql('HELLO WORLD\nThis is a line that needs to be at least a little longer than 80 characters so\nthat we can check the character wrapping functionality.\n\nThis is a test of a link [https://github.com/Flolagale/mailin] .');
                done();
            } catch (e) {
                done(e);
            }
        });

        /* Make an smtp client to send an email. */
        var client = new SMTPConnection({
            port: 2500,
            ignoreTLS: true
        });

        client.connect(function () {
            client.send({
                from: {
                    name: 'Me',
                    address: 'me@jokund.com'
                },
                to: [{
                    name: '',
                    address: 'to@jokund.com'
                }]
            }, fs.createReadStream('./test/fixtures/test-html-only.eml'), function (err) {
                if (err) {
                    done(err);
                }
            });
        });

    });

    it('should not validate sender domain DNS by default', function (done) {
        this.timeout(10000);

        mailin.on('message', function (connection, data) {
            data.html.should.eql('<b>Hello world!</b>');
            done();
        });

        /* Make an smtp client to send an email. */

        var client = new SMTPConnection({
            port: 2500,
            ignoreTLS: true
        });

        client.connect(function () {
            client.send({
                from: {
                    name: 'Me',
                    address: 'me@jokund.com'
                },
                to: [{
                    name: 'First Receiver',
                    address: 'first@jokund.com'
                }, {
                    name: '',
                    address: 'second@jokund.com'
                }]
            }, fs.createReadStream('./test/fixtures/test.eml'), function (err) {
                done(err);
            });
        });
    });

    /* This test should run as the last test since it restarts mailin with
     * different options. */
    it('should validate sender domain DNS if requested', function (done) {
        this.timeout(10000);

        mailin.stop(function (err) {
            try {
                if (err) console.log(err);
                should.not.exist(err);
            } catch (e) {
                return done(e);
            }

            mailin.start({
                disableDNSValidation: false,
                smtpOptions: {
                    disabledCommands: ['AUTH'],
                    secure: false
                }
            }, function (err) {
                try {
                    if (err) console.log(err);
                    should.not.exist(err);
                } catch (e) {
                    return done(e);
                }

                var doneEvents = [];
                var registerDoneEvent = function (eventName) {
                    doneEvents.push(eventName);
                    var remaining = _.xor(doneEvents, ['senderValidationFailed', 'error']);
                    if (remaining.length === 0) {
                        done();
                    }
                };

                mailin.on('senderValidationFailed', function (err) {
                    err = err || undefined;
                    try {
                        should.exist(err);
                        err.should.equal('envelopefrom@foo.fifoo');
                        registerDoneEvent('senderValidationFailed');
                    } catch (e) {
                        return done(e);
                    }
                });

                /* Make an smtp client to send an email. */
                var client = new SMTPConnection({
                    port: 2500,
                    ignoreTLS: true
                });

                var errorFunction = function (err) {
                    err = err || undefined;
                    try {
                        should.exist(err);
                        console.log(err);
                        err.response.indexOf('Sender address rejected: Domain not found').should.not.equal(-1);
                        registerDoneEvent('error');
                    } catch (e) {
                        return done(e);
                    }
                };

                client.connect(function () {
                    client.send({
                        from: {
                            name: 'Me',
                            address: 'envelopefrom@foo.fifoo'
                        },
                        to: [{
                            name: 'First Receiver',
                            address: 'first@jokund.com'
                        }, {
                            name: '',
                            address: 'second@jokund.com'
                        }]
                    }, fs.createReadStream('./test/fixtures/test.eml'), errorFunction);
                });
            });
        });
    });
});
