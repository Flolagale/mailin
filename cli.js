#!/usr/bin/env node
'use strict';

var logger = require('./lib/logger');
var mailin = require('./lib/mailin');
var program = require('commander');

function collectOptions(keyValue, options) {
    if (!keyValue || keyValue.indexOf(':') < 0) {
        logger.error('Ignoring option '  + keyValue);
        return options;
    }
    options = options || {};
    var split = keyValue.split(':');
    options[split[0]] = split[1];
    return options;
}

function list(val) {
    return val.split(',');
}

var pkg = require('./package.json');

program.version(pkg.version)
    .option('-p, --port <n>', 'The port to which the mailin smtp server should listen to. Default to 25.', parseInt)
    .option('-w, --webhook [url]', 'The webhook url to which the parsed emails are posted. Default to http://localhost:3000/webhook.')
    .option('-l, --log-file [file path]', "The log file path. Default to '/var/log/mailin.log'.")
    .option('--disable-dkim', 'Disable dkim checking. The dkim field in the webhook payload will be set to false.')
    .option('--disable-spf', 'Disable spf checking. The spf field in the webhook payload will be set to false.')
    .option('--disable-spam-score', 'Disable spam score computation. The spamScore field in the webhook payload will be set to 0.0.')
    .option('--verbose', 'Set the logging level to verbose.')
    .option('--debug', 'Printout debug info such as the smtp commands.')
    .option('--profile', 'Enable basic memory usage profiling.')
    .option('--enable-dns-validation', 'Disable DNS domain lookup')
    .option('--disabled-smtp-commands [value]', 'smtp disabled commands list, comma separated', list)
    .option('--smtp [value]', 'smtp options split with :, check https://github.com/andris9/smtp-server/tree/v1.4.0', collectOptions, {});

/* Hack the argv object so that commander thinks that this script is called
 * 'mailin'. The help info will look nicer. */
process.argv[1] = 'mailin';
program.parse(process.argv);

logger.info('Mailin v' + pkg.version);

var smtpOptions = program.smtp;
smtpOptions.disabledCommands = program.disabledSmtpCommands;

mailin.start({
    port: program.port || 25,
    webhook: program.webhook || 'http://localhost:3000/webhook',
    logFile: program.logFile || '/var/log/mailin.log',
    disableDkim: program.disableDkim,
    disableSpf: program.disableSpf,
    disableSpamScore: program.disableSpamScore,
    verbose: program.verbose,
    debug: program.debug,
    profile: program.profile,
    disableDNSValidation: !program.enableDnsValidation,
    smtpOptions: smtpOptions
}, function (err) {
    if (err) process.exit(1);

    logger.info('Webhook url: ' + mailin.options.webhook);

    if (mailin.options.logFile) logger.info('Log file: ' + mailin.options.logFile);

    if (mailin.options.disableDkim) logger.info('Dkim checking is disabled');
    if (mailin.options.disableSpf) logger.info('Spf checking is disabled');
    if (mailin.options.disableSpamScore) logger.info('Spam score computation is disabled');
});
