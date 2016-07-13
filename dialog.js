var series = require('async-series');
var util = require('util');
var EventEmitter = require('events');

/**
 * Starts a new dialog with a user
 * @param {Conversation} switchBoard
 * @param {Hubot.Response} msg
 * @param {Array} messageOptions - refer to docs in index.js `Conversation.prototype.start`
 * @api private
 */
function Dialog(switchBoard, msg, messageOptions) {
  EventEmitter.call(this);
  this.dialog = switchBoard.startDialog(msg, Dialog.TIMEOUT);
  this.msg = msg;
  this.messageOptions = messageOptions;

  this.data = {
    source: '',
    dateTime: null,
    type: 'private',
    description: '',
    attachment: ''
  };

  this.data.source = msg.envelope.user;
}
util.inherits(Dialog, EventEmitter);

/**
 * Invoke a dialog message with the user and collect the response into the data
 * @param  {Object}   message It holds the message model
 * eg. {
 *       question: 'Do you have any trouble',
 *       answer: {
 *         type: 'text'
 *       },
 *       required: false,
 *       error: 'Sorry, did not understand response'
 *     }
 * @param  {Function} done    The function provided by async-series to call the next dialog message
 * @return {null}
 * @api private
 */
Dialog.prototype._invokeDialog = function (message, done) {
  var self = this;
  var question = message.question.trim();
  var code = question.charCodeAt(question.length - 1);

  if (!message.required) {
    question = ((code === 46 || code === 63) ? question : question + '.') + ' Reply with `skip` to move to the next question.';
  }

  self.msg.reply(question);

  if (!message.required) {
    self.dialog.addChoice(/skip/i, function (dialogMessage) {
      dialogMessage.reply('Ok. we are skipping this section!!');
      self.msg = dialogMessage;
      done();
    });
  }

  if (message.answer.type === 'choice') {
    for (var j = 0, len = message.answer.options.length; j < len; j++) {
      (function choiceRunner(choiceIndex) {
        var option = message.answer.options[choiceIndex];
        self.dialog.addChoice(new RegExp(option.match, 'i'), function (dialogMessage) {
          dialogMessage.reply(option.response);
          self.data.type = option.match;
          if (!option.valid) {
            return done(new Error('User provided an invalid response'));
          }
          self.msg = dialogMessage;
          done();
        });

        self.dialog.addChoice(/(.*)/i, function (dialogMessage) {
          dialogMessage.reply(message.error);
          // Rerun the choice question when it fails
          self.msg = dialogMessage;
          choiceRunner(choiceIndex);
        });
      })(j);
    }
  }

  if (message.answer.type === 'text') {
    self.dialog.addChoice(/^(?!\s*$).+/i, function (dialogMessage) {
      self.data.description = dialogMessage.message.text;
      self.msg = dialogMessage;
      done();
    });
  }

  // TODO: provide proper implementation of attachment
  if (message.answer.type === 'attachment') {
  }
};

/**
 * Gets the data for the dialog
 * @return {Object} The object that describes the dialog
 * @api public
 */
Dialog.prototype.fetch = function () {
  return this.data;
};


/**
 * Starts the dialog with the user
 * @return {null}
 * @api public
 */
Dialog.prototype.start = function () {
  var self = this;
  var cbs = [];

  // set all the dialog messages as callback functions that will be run in series
  // that means the next question won't be asked until the previous one has been
  // dealt with
  for (var i = 0, l = self.messageOptions.length; i < l; i++) {
    (function (currIndex) {
      var message = self.messageOptions[currIndex];
      cbs.push(function (done) {
        self._invokeDialog(message, done);
      });
    })(i);
  }

  cbs.push(function (done) {
    self.msg.reply('Thanks for making a report. We are looking into it!!');
    self.data.dateTime = new Date();
    done();
  });

  // call the callbacks in series
  // emit `end` when all is done or an error occurs
  series(cbs, function (err) {
    return self.emit('end', err, self.msg);
  });
};

Dialog.TIMEOUT = 500 * 1000;

/**
 * Module exports
 * @type {Dialog}
 * @public
 */
module.exports = Dialog;
