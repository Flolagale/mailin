mailin
======

__Artisanal inbound emails for every web app__

Mailin is an smtp server that listen for emails, parse them and post them as json to the url of your choice.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

####From the command line

Install mailin globally.

```
npm install -g mailin
```

Run it, specifying your webhook url (addtionnal help can be found using ```mailin --help```)
```
mailin --webhook http://mydomain.com/incoming_emails
```
From now on, mailin will listen for incoming emails, parse them and post an urlencoded form ```application/x-www-form-urlencoded``` to your webhook url.
