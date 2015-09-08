'use strict';
var simplesmtp = require("simplesmtp"),
    fs = require("fs");

var client = simplesmtp.connect(2500);

// run only once as 'idle' is emitted again after message delivery
client.once("idle", function () {
    client.useEnvelope({
        from: "me@example.com",
        to: ["receiver1@example.com", "receiver2@example.com"]
    });
});

client.on("message", function () {
    fs.createReadStream("test.eml").pipe(client);
});
