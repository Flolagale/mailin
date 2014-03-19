'use strict';

var child_process = require('child_process');

module.exports = {
    validateDkim: function (msg, callback) {
        var verifyDkim = child_process.spawn('python', ['python/verifydkim.py']);

        verifyDkim.stdout.on('data', function (data) {
            console.log(data.toString());
        });

        verifyDkim.on('close', function (code) {
            console.log('closed with return code ' + code);
            /* Convert return code to appropriate boolean. */
            return callback(null, !! !code);
        });

        verifyDkim.stdin.write(msg);
        verifyDkim.stdin.end();
    },

    validateSpf: function (ip, address, host, callback) {
        var cmd = 'python python/verifyspf.py ' + ip + ' ' + address + ' ' + host;
        console.log(cmd);
        child_process.exec(cmd, function (err, stdout) {
            console.log(stdout);
            var code = 0;
            if (err) {
                code = err.code;
            }

            console.log('closed with return code ' + code);

            /* Convert return code to appropriate boolean. */
            return callback(null, !! !code);
        });
    }
};
