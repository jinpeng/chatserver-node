var Busboy = require('busboy');
var uuid = require('node-uuid');
var path = require('path');
var fs = require('fs');
var util = require('util');
var exec = require('child_process').exec;

var Datastore = require('nedb');
var UsersDB = new Datastore({
    filename: path.join(path.dirname(__filename), '..', 'users.db'),
    autoload: true
});

UsersDB.ensureIndex({
    fieldName: 'publicID',
    unique: true
}, function(err) {
    if (err) {
        console.warn("Unable to create index for 'publicID' property: " + err);
    }
});

var makeURL = function(req, path) {
    return 'http://' + req.get('host') + path;
}

var cleanUser = function(doc, req) {
    return {
        id: doc.publicID,
        name: doc.name,
        password: doc.password,
        created: doc.created,
        signedin: doc.signedin,
        url: makeURL(req, '/users/' + doc.publicID)
    };
}

/**
 * GET /users
 */
exports.list = function(req, res) {
    UsersDB.find({}).sort({
        created: -1
    }).exec(function(err, docs) {
        if (docs) {
            var users = docs.map(function(e) {
                return cleanUser(e, req);
            });

            res.format({
                json: function() {
                    res.json(users);
                },
                html: function() {
                    res.render('users', {
                        users: users,
                        timeago: require('timeago-words')
                    });
                }
            });
        } else {
            res.format({
                json: function() {
                    res.json(500, {
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            });
        }
    });
};

/**
 * GET /users/:user_id
 */
exports.get = function(req, res) {
    var userID = req.params.user_id;
    UsersDB.find({
        publicID: userID
    }, function(err, docs) {
        if (docs) {
            var user = cleanUser(docs[0], req);
            res.format({
                json: function() {
                    res.json(user)
                },
                html: function() {
                    res.render('user', {
                        user: user,
                        timeago: require('timeago-words')
                    });
                }
            });
        } else {
            res.format({
                json: function() {
                    res.json(500, {
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
};

/**
 * POST /users
 */
exports.add = function(req, res) {
    console.log('Start processing user.add!');
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);

    var id = uuid.v1();
    var user = {
        publicID: id,
        created: new Date(),
        signedin: false
    };

    if (req.body['user']) {
        requser = req.body['user'];
        user.name = requser['name'];
        user.password = requser['password'];

        UsersDB.insert(user, function(err, newDoc) {
            if (err === null) {
                res.format({
                    json: function() {
                        user.id = id;
                        res.json(201, user);
                    },
                    html: function() {
                        res.writeHead(303, {
                            Connection: 'close',
                            Location: '/users/' + id
                        });
                        res.end();
                    }
                })
            }
        });
    } else {
        console.log('Parsing with busboy...');
        var busboy = new Busboy({
            headers: req.headers
        });
        busboy.on('field', function(fieldname, value, fieldnameTruncated, valueTruncated) {
            console.log('Parsing form: ' + fieldname);
            if (fieldname === 'name') {
                user.name = value;
            } else if (fieldname === 'password') {
                user.password = value;
            } else {
                console.warn("Unknown field: " + fieldname);
            }
        });
        busboy.on('finish', function() {
            UsersDB.insert(user, function(err, newDoc) {
                if (err === null) {
                    res.format({
                        json: function() {
                            user.id = id;
                            res.json(201, user);
                        },
                        html: function() {
                            res.writeHead(303, {
                                Connection: 'close',
                                Location: '/users/' + id
                            });
                            res.end();
                        }
                    })
                }
            });
        });
        req.pipe(busboy);
    }

};

/**
 * DELETE /users/:user_id
 */
exports.delete = function(req, res) {
  var userID = req.params.user_id;
  UsersDB.remove({ publicID: userID }, {}, function(err, numRemoved) {
    if (err) {
      res.format({
        json: function() {
          res.json(500, { error: err });
        },
        html: function() {
          res.send(500, err);
        }
      });
    }
    else {
      res.format({
        json: function() {
          res.json(200, {});
        },
        html: function() {
          res.redirect('/users');
        }
      });
    }
  });
}

/**
 * PUT /account
 */
exports.login = function(req, res) {
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);

    var userName, userPassword;
    if (req.body['user']) {
        requser = req.body['user'];
        userName = requser['name'];
        userPassword = requser['password'];
        console.log("REQ -- login: " + userName + " -- " + userPassword);
    }

    UsersDB.find({
        name: userName,
        password: userPassword
    }, function(err, docs) {
        if (docs && docs.length > 0) {
            var user = cleanUser(docs[0], req);
            UsersDB.update({ publicID: user.publicID },
                            { $set: { signedin: true } },
                            {},
                            function (err, numReplaced, newDoc) {
                                if (!err) {
                                    res.format({
                                        json: function() {
                                            res.json(201, user);
                                        },
                                        html: function() {
                                            res.render('user', {
                                                user: user,
                                                timeago: require('timeago-words')
                                            });
                                        }
                                    });
                                } else {
                                    res.format({
                                        json: function() {
                                            res.json(500, {
                                                error: err
                                            });
                                        },
                                        html: function() {
                                            res.write(500, err);
                                        }
                                    })
                                    console.warn("Unable to update " + user.publicID + ": " + err);
                                }
                            });
        } else {
            res.format({
                json: function() {
                    res.json(500, {
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
            console.warn("Unable to find " + userName + ": " + err);
        }
    });
}

/**
 * DELETE /account/:user_id
 */
exports.logout = function(req, res) {
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);

    var userID = req.params.user_id;
    console.log("REQ -- logout: " + userID);

    UsersDB.find({
        publicID: userID
    }, function(err, docs) {
        if (docs && docs.length > 0) {
            var user = cleanUser(docs[0], req);
            user.signedin = false;
            UsersDB.update({ publicID: userID },
                            { $set: { signedin: user.signedin } },
                            {},
                            function (err, numReplaced, newDoc) {
                                if (!err) {
                                    res.format({
                                        json: function() {
                                            res.json(200, user);
                                        },
                                        html: function() {
                                            res.render('user', {
                                                user: user,
                                                timeago: require('timeago-words')
                                            });
                                        }
                                    });
                                } else {
                                    res.format({
                                        json: function() {
                                            res.json(500, {
                                                error: err
                                            });
                                        },
                                        html: function() {
                                            res.write(500, err);
                                        }
                                    })
                                    console.warn("Unable to update " + userID + ": " + err);
                                }
                            });
        } else {
            res.format({
                json: function() {
                    res.json(500, {
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
}

