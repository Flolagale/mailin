#!/usr/bin/env node
'use strict';

var logger = require('./lib/logger');
var mailin = require('./lib/mailin');
var program = require('commander');

var pkg = require('./package.json');

program.version(pkg.version)
    .option('-p, --port <n>', 'The port to which the mailin smtp server should listen to. Default to 25.', parseInt)
    .option('-w, --webhook [url]', 'The webhook url to which the parsed emails are posted. Default to http://localhost:3000/webhook.')
    .option('-l, --log-file [file path]', "The log file path. Default to '/var/log/mailin.log'.");

program.parse(process.argv);

logger.info('Mailin v' + pkg.version);
mailin.start({
    port: program.port || 25,
    webhook: program.webhook || 'http://localhost:3000/webhook',
    logFile: program.logFile || '/var/log/mailin.log'
}, function (err) {
    if (err) process.exit(1);

    logger.info('Webhook url: ' + mailin.options.port);
    if (mailin.options.logFile) {
        logger.info('Log file: ' + mailin.options.logFile);
    }
});
