/**
 * Streaming QS Parser
 */

var EventEmitter = require('events').EventEmitter
  , StringDecoder = require('string_decoder').StringDecoder;

var AMP = '&'.charCodeAt(0)
  , EQUAL = '='.charCodeAt(0);

/**
 * Parser
 */

var Parser = function() {
  if (!(this instanceof Parser)) {
    return new Parser();
  }

  EventEmitter.call(this);

  this.state = 'key';
  this.buff = '';
  this.decode = new StringDecoder('utf8');
  this.written = 0;
};

Parser.prototype.__proto__ = EventEmitter.prototype;

Parser.prototype.write = function(data) {
  if (!this.writable) return;

  try {
    this._write(data);
  } catch(e) {
    this._error(e);
  }

  this.written += data.length;
  this.emit('data', data.length);
};

Parser.prototype._write = function(data) {
  var i = 0
    , k = 0
    , l = data.length
    , ch;

  for (; i < l; i++) {
    ch = data[i];
    switch (this.state) {
      case 'key':
        switch (ch) {
          case EQUAL:
            this.state = 'value';
            this.buff += this.decode.write(data.slice(0, i));
            this.key = unescape(this.buff);
            this.buff = '';
            k = i + 1;
            break;
          case AMP:
            return this._error('Unexpected AMP.');
          default:
            break;
        }
        break;
      case 'value':
        switch (ch) {
          case AMP:
            this.state = 'key';
            this.buff += this.decode.write(data.slice(0, i));
            this.emit('value', this.key, unescape(this.buff));
            this.key = '';
            this.buff = '';
            k = i + 1;
            break;
          case EQUAL:
            return this._error('Unexpected EQUAL.');
          default:
            break;
        }
        break;
    }
  }

  if (k < data.length) {
    this.buff += this.decode.write(data.slice(k));
  }
};

Parser.prototype.end = function(data) {
  if (data) this.write(data);
  this.emit('end');
};

Parser.prototype._error = function(err) {
  this.destroy();
  this.emit('error', new Error(err + ''));
};

Parser.prototype.destroy = function(err) {
  this.writable = false;
  this.readable = false;
};

var unescape = function(str) {
  try {
    str = decodeURIComponent(str.replace(/\+/g, ' '));
  } catch(e) {
    return str.replace(/\0/g, '');
  }
};

/**
 * Middleware
 */

Parser.middleware = function(options) {
  return function(req, res, next) {
    if (req.method === 'GET'
        || req.method === 'HEAD'
        || req.body) return next();

    var type = req.headers['content-type'];
    if (!type) return next();

    type = type.split(';')[0].trim().toLowerCase();

    if (type == 'application/x-www-form-urlencoded') {
      Parser.handle(req, res, next, options);
    } else {
      next();
    }
  };
};

/**
 * Handler
 */

Parser.handle = function(req, res, next, options) {
  var parser = new Parser()
    , data = {};

  parser.on('value', function(key, value) {
    data[key] = value;
  });

  parser.on('end', function() {
    req.body = data;
    next();
  });

  parser.on('error', function(err) {
    req.destroy();
    next(err);
  });

  if (options.limit) {
    parser.on('data', function() {
      if (this.written > options.limit)
        this.destroy();
    });
  }

  req.pipe(parser);
};

/**
 * Expose
 */

module.exports = Parser;