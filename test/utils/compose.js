'use strict';
var MailComposer = require("mailcomposer").MailComposer;
var mailcomposer = new MailComposer();
var fs = require("fs");

// add additional header field
mailcomposer.addHeader("x-mailer", "Nodemailer 1.0");

// setup message data
mailcomposer.setMessageOption({
    from: "andris@tr.ee",
    to: "andris@node.ee",
    body: "Hello world!",
    html: "<b>Hello world!</b>"
});

mailcomposer.addAttachment({
    fileName: 'dummyFile.txt',
    contents: 'my dummy attachment contents'
});

mailcomposer.streamMessage();

// pipe the output to a file
mailcomposer.pipe(fs.createWriteStream("./test/fixtures/test.eml"));
