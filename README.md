#Mailin [![Build Status](https://travis-ci.org/Flolagale/mailin.svg?branch=master)](https://travis-ci.org/Flolagale/mailin)

__Artisanal inbound emails for every web app__
<img align="right" src="postman.jpg"/>

Mailin is an smtp server that listens for emails, parses them and posts them as json to the url of your choice.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

Mailin relies heavily on the excellent work of [@andris9](https://github.com/andris9) for the smtp and mail parsing services.

Why? Because we needed it for our startup [jokund.com](http://jokund.com).

### Show me a demo!
Sure! A demo is live at [mailin.io](http://mailin.io). Please notice that it is running on the smallest Digital Ocean instance, so be fair if it is overloaded.

###Initial setup

####Dependencies

Mailin can run without any dependencies other than node itself, but having them allow you to use some additional features.

So first make sure the node is available, and the ```node``` command as well. On Debian/Ubuntu boxes:
```
sudo aptitude install nodejs ; sudo ln -s $(which nodejs) /usr/bin/node
```

To handle dkim and spf checking, Mailin depends on Python 2.7. On Linux machines, it is very not likely that you don't have a decent version of Python available.

To handle the spam score computation, Mailin depends on spamassassin and its server interface spamc. Both should be available as packages on your machine. For instance on Debian/Ubuntu boxes:
```
sudo aptitude install spamassassin spamc
```
Spamassassin is not enabled by default, enable it in ```/etc/default/spamassassin```.

####The crux: setting up your DNS correctly

In order to receive emails, your smtp server address should be made available somewhere. Two records should be added to your DNS records. Let us pretend that we want to receive emails at ```*@subdomain.domain.com```:
* First an MX record: ```subdomain.domain.com MX 10 mxsubdomain.domain.com```. This means that the mail server for addresses like ```*@subdomain.domain.com``` will be ```mxsubdomain.domain.com```.
* Then an A record: ```mxsubdomain.domain.com A the.ip.address.of.your.mailin.server```. This tells at which ip address the mail server can be found.

You can fire up Mailin (see next section) and use an [smtp server tester](http://mxtoolbox.com/diagnostic.aspx) to verify that everything is correct.


###Using Mailin
####From the command line

Install mailin globally.

```
sudo npm install -g mailin
```

Run it, specifying your webhook url (addtionnal help can be found using ```mailin --help```). By default, Mailin will listen on port 25, the standard smtp port. you can change this port for testing purpose using the ```--port``` option. However, do not change this port if you want to receive emails from the real world.

Ports number under 1000 are reserved to root user. So two options here. Either run Mailin as root:
```
sudo mailin --webhook http://mydomain.com/incoming_emails
```
Or, prefered choice, use something like ```authbind``` to run Mailin with a standard user while still using port 25.
Here comes a [tutorial on how to setup authbind](http://respectthecode.tumblr.com/post/16461876216/using-authbind-to-run-node-js-on-port-80-with-dreamhost). In this case, do something like:
```
authbind --deep mailin --webhook http://mydomain.com/incoming_emails
```
and make sure the your user can write to the log file.

At this point, Mailin will listen for incoming emails, parse them and post an urlencoded form ```multipart/form-data``` to your webhook url.

#####Webhook format
The webhook payload is a multipart form with a ```mailinMsg``` fields always present and some optionnal additional fields containing the content of the attachements. How to handle this? We got you covered, there is a working example using node and express in [mailin/test/utils/server.js](https://github.com/Flolagale/mailin/blob/master/test/utils/server.js). Anyway, once parsed, you should end up with something like:
```
{
  mailinMsg:
  {
      html: '<div><b>Hello world!</b></div>',
      text: 'Hello world!',
      headers: {
          from: 'John Doe <john.doe@somewhere.com>',
          to: 'Jane Doe <jane.doe@somewhereelse.com>',
          'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1395066415427"',
          'mime-version': '1.0'
      },
      priority: 'normal',
      from: [{
          address: 'john.doe@somewhere.com',
          name: 'John Doe'
      }],
      to: [{
          address: 'jane.doe@somewhereelse.com',
          name: 'Jane Doe'
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
      spf: 'pass',
      spamScore: 3.3,
      language: 'english',
      cc: [{
        address: 'james@mail.com',
        name: 'James'
      }],
      connectionId: 'gez8t84g',
      authentication: { username: null, authenticated: false },
      envelopeFrom: [ { address: 'john.doe@somewhere.com', name: 'John Doe' } ],
      envelopeTo: [ { address: 'jane.doe@somewhereelse.com', name: 'Jane Doe' } ]
  },
  'dummyFile.txt': 'a-base64-encoded-string=='
}
```

#####Gotchas
* ```error: listen EACCES```: your user do not have sufficients privileges to run on the given port. Ports under 1000 are restricted to root user. Try with [sudo](http://xkcd.com/149/).
* ```error: listen EADDRINUSE```: the current port is already used by something. Most likely, you are trying to use port 25 and your machine's [mail transport agent](http://en.wikipedia.org/wiki/Message_transfer_agent) is already running. Stop it with something like ```sudo service exim4 stop``` or ```sudo service postfix stop``` before using Mailin.
* ```error: Unable to compute spam score ECONNREFUSED```: it is likely that spamassassin is not enabled on your machine, check the ```/etc/default/spamassassin``` file.
* ```node: command not found```: most likely, your system does not have node installed or it is installed with a different name. For instance on Debian/Ubuntu, the node interpreter is called nodejs. The quick fix is making a symlink: ```ln -s $(which nodejs) /usr/bin/node``` to make the node command available.

####Embedded inside a node application

Install Mailin locally.

```
sudo npm install --save mailin
```

Start the Mailin server and listen to events.

```javascript
var mailin = require('mailin');

/* Event emitted when a connection with the Mailin smtp server is initiated. */
mailin.on('startMessage', function (messageInfo) {
  /* messageInfo = {
      from: 'sender@somedomain.com',
      to: 'someaddress@yourdomain.com',
      connectionId: 't84h5ugf',
      authentication: { username: null, authenticated: false }
    }
  }; */
  console.log(messageInfo);
});

/* Event emitted after a message was received and parsed.
 * The message parameters contains the parsed email. */
mailin.on('message', function (message) {
  console.log(message);
  /* Do something useful with the parsed message here.
   * Use it directly or modify it and post it to a webhook. */
});

/* Start the Mailin server. The available options are: 
 *  options = {
 *     port: 25,
 *     webhook: 'http://mydomain.com/mailin/incoming,
 *     disableWebhook: false,
 *     logFile: '/some/local/path',
 *     logLevel: 'warn', // One of silly, info, debug, warn, error
 *     smtpOptions: { // Set of options directly passed to simplesmtp.createServer(smtpOptions)
 *        SMTPBanner: 'Hi from a custom Mailin instance'
 *     }
 *  };
 * Here disable the webhook posting so that you can do what you want with the
 * parsed message. */
mailin.start({
  port: 25,
  disableWebhook: true // Disable the webhook posting.
});

/* Access simplesmtp server instance. */
mailin.smtp.on('authorizeUser', function(connection, username, password, done) {
  if (username == "johnsmith" && password == "mysecret") {
    done(null, true);
  } else {
    done(new Error("Unauthorized!"), false);
  }
});
```

###Todo
If webhook fails, schedule some retries.


Notice: Postman image copyright [Charlie Allen](http://charlieallensblog.blogspot.fr)
