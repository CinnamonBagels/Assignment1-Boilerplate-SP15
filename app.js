//dependencies for each module used
var express = require('express');
var passport = require('passport');
var InstagramStrategy = require('passport-instagram').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var http = require('http');
var path = require('path');
var handlebars = require('express-handlebars');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var dotenv = require('dotenv');
var Instagram = require('instagram-node-lib');
var mongoose = require('mongoose');
var graph = require('fbgraph')
var app = express();

//local dependencies
var models = require('./models');

//client id and client secret here, taken from .env
var local = false;
dotenv.load();
var INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
var INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
var INSTAGRAM_CALLBACK_URL = local === false ? process.env.INSTAGRAM_CALLBACK_URL : 'http://localhost:3000/auth/instagram/callback';
var INSTAGRAM_ACCESS_TOKEN = "";
var FACEBOOK_CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
var FACEBOOK_CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;
var FACEBOOK_CALLBACK_URL = local === false ? process.env.FACEBOOK_CALLBACK_URL : 'http://localhost:3000/auth/facebook/callback';
Instagram.set('client_id', INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', INSTAGRAM_CLIENT_SECRET);

//connect to database
mongoose.connect(process.env.MONGOLAB_URI);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log("Database connected succesfully.");
});

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Instagram profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});



passport.use(new FacebookStrategy({
    clientID : FACEBOOK_CLIENT_ID,
    clientSecret : FACEBOOK_CLIENT_SECRET,
    callbackURL : FACEBOOK_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
      models.User.findOrCreate({
        name : profile.displayName,
        id : profile.id,
        access_token : accessToken,
        account_type : 'facebook'
      },
      function(err, user, created) {
        models.User.findOrCreate({}, function(err, user, created) {
          process.nextTick(function() {
            return done(null, profile);
          });
        });
      });
  }
));
// Use the InstagramStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Instagram
//   profile), and invoke a callback with a user object.
passport.use(new InstagramStrategy({
    clientID: INSTAGRAM_CLIENT_ID,
    clientSecret: INSTAGRAM_CLIENT_SECRET,
    callbackURL: INSTAGRAM_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    models.User.findOrCreate({
      "name": profile.username,
      "id": profile.id,
      "access_token": accessToken,
      "account_type" : 'instagram'
    }, function(err, user, created) {
      
      // created will be true here
      models.User.findOrCreate({}, function(err, user, created) {
        // created will be false here
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, profile);
        });
      })
    });
  }
));

//Configures the Template engine
app.engine('handlebars', handlebars({defaultLayout: 'layout'}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat',
                  saveUninitialized: true,
                  resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//set environment ports and start application
app.set('port', process.env.PORT || 3000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/login');
}

function ensureFacebookAuthenticated(req, res, next) {
  if(req.isAuthenticated() && req.user.provider === 'facebook') {
    return next();
  }

  res.redirect('/login');
}

function ensureIgAuthenticated(req, res, next) {
  if(req.isAuthenticated() && req.user.provider === 'instagram') {
    return next();
  }

  res.redirect('/login')
}

//routes
app.get('/', function(req, res){
  res.render('login');
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

app.get('/account', ensureAuthenticated, function(req, res){
  if(req.user.provider === 'instagram') {
    res.render('account', {user : req.user, isInstagram : true});
  } else if(req.user.provider === 'facebook') {
    res.render('account', {user: req.user, isFacebook : true });
  } else {
    res.render('account', { user: req.user });
  }
});


app.get('/facebookfriends', ensureFacebookAuthenticated, function(req, res) {
  var query = models.User.where({ name : req.user.displayName });
query.findOne(function(err, user) {
    if(err) return console.log(err);
    if(user) {
      graph.setAccessToken(user.access_token);
      var params = { fields : 'picture' };
      graph.get('/me/friends', function(err, friends) {
        console.log(friends);
        var friendData = friends.data.map(function(friend) {
          tempJSON = {};
          tempJSON.name = friend.name;
          graph.get(friend.id, params, function(err, friendPic) {
            tempJSON.url = friendPic.picture.data.url;
            return tempJSON;
          });
        });
        console.log(friendData);
        res.render('facebookfriends', {friends : friendData, isFacebook : true, user : req.user, count : friends.summary.total_count})
      })
    }
})
});

app.get('/facebookphotos', ensureFacebookAuthenticated, function(req, res) {
  var query = models.User.where({ name : req.user.displayName });

  query.findOne(function(err, user) {
    if(err) return console.log(err);
    if(user) {
      graph.setAccessToken(user.access_token);
      var params = { limit : 12 };

      graph.get('/me/photos', params, function(err, photos) {
        console.log(photos.data);

        var imgArray;
        imgArray = photos.data.map(function(photo) {
          tempJSON = {};
          tempJSON.url = photo.source;
          return tempJSON;
        });

        res.render('facebookphotos', {photos : imgArray, isFacebook : true, user : req.user });
      });
    }
  })
})

function secondLevel(likeDist, next, callback) {
  graph.get(next, function(err, likes) {
    likes.data.forEach(function(like) {
      if(!likeDist[like.category]) {
        likeDist[like.category] = 1;
      } else {
        likeDist[like.category]++;
      }
    });

    likeDist.sort(function(e1, e2) {
      return e1 - e2;
    });

    return callback(Object.keys(likeDist)[0], likeDist[Object.keys(likeDist)[0]]);
  });
}

app.get('/facebooklikes', ensureFacebookAuthenticated, function(req, res) {
  var query = models.User.where({ name: req.user.displayName });

  query.findOne(function(err, user) {
    if(err) return handleError(err);
    if(user) {
      graph.setAccessToken(user.access_token);
      var params = { fields : 'picture' };
      graph.get('/me/likes', function(err, likes) {
        var likeDist = [];

        var likeArr = likes.data.map(function(like) {
          tempJSON = {};
          tempJSON.name = like.name;
          tempJSON.category = like.category;
          if(!likeDist[like.category]) {
            likeDist[like.category] = 1;
          } else {
            likeDist[like.category]++;
          }

          return tempJSON;
        });

        if(likes.paging && likes.paging.next) {
          secondLevel(likeDist, likes.paging.next, function(mostlikes, count) {
            console.log(mostlikes);
            res.render('facebooklikes', {likes : likes.data, isFacebook : true, user : req.user, mostLikes : mostlikes, count : count});
          });
        }

      });
    }
  });
})
app.get('/photos', ensureIgAuthenticated, function(req, res){
  var query  = models.User.where({ name: req.user.username });
  query.findOne(function (err, user) {
    if (err) return handleError(err);
    if (user) {
      // doc may be null if no document matched
      Instagram.users.liked_by_self({
        access_token: user.access_token,
        complete: function(data) {
          //Map will iterate through the returned data obj
          var imageArr = data.map(function(item) {
            //create temporary json object
            tempJSON = {};
            tempJSON.url = item.images.low_resolution.url;
            tempJSON.cap = JSON.stringify(item.caption.text);
            //insert json object into image array
            return tempJSON;
          });
          res.render('photos', {photos: imageArr, user: req.user, isInstagram : true});
        }
      }); 
    }
  });
});


// GET /auth/instagram
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Instagram authentication will involve
//   redirecting the user to instagram.com.  After authorization, Instagram
//   will redirect the user back to this application at /auth/instagram/callback
app.get('/auth/instagram',
  passport.authenticate('instagram'),
  function(req, res){
    // The request will be redirected to Instagram for authentication, so this
    // function will not be called.
  });

app.get('/auth/facebook', passport.authenticate('facebook', { scope : ['user_likes', 'read_custom_friendlists', 'user_photos', 'user_friends']}),
  function(req, res) {
    //
  });

// GET /auth/instagram/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/instagram/callback', 
  passport.authenticate('instagram', { failureRedirect: '/login'}),
  function(req, res) {
    res.redirect('/account');
  });

app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login', successRedirect : '/account' }));

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});
