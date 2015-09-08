'use strict';
var MailComposer = require("mailcomposer").MailComposer;
var mailcomposer = new MailComposer();
var fs = require("fs");

// add additional header field
mailcomposer.addHeader("x-mailer", "Nodemailer 1.0");

// setup message data
mailcomposer.setMessageOption({
    from: "Me <me@jokund.com>",
    to: "First Receiver <first@jokund.com>, second@jokund.com",
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
