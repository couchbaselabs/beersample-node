var fs = require('fs');
var express = require('express');
var jade = require('jade');
var couchbase = require('couchbase');
var _ = require('underscore');
var ViewQuery = couchbase.ViewQuery;

var ENTRIES_PER_PAGE = 30;

exports.start = function(config)
{
  // Connect with couchbase server.  All subsequent API calls
  // to `couchbase` library is made via this Connection
  var cb = new couchbase.Cluster(config.connstr);
  var db = cb.openBucket(config.bucket);
  db.on('connect', function(err) {
    if(err) {
      console.error("Failed to connect to cluster: " + err);
      process.exit(1);
    }

    console.log('Couchbase Connected');
  });

  var app = express();
  app.use(express.bodyParser());
  app.use(express.static('static'));
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.locals.pretty = true;

  // Index page redirect
  app.get('/', function(req, res) {
    res.redirect('/welcome');
  });

  // Welcome page.
  function welcome(req, res) {
    res.render('welcome');
  }
  app.get('/welcome', welcome);

  // List of beers.
  function list_beers(req, res) {
    var q = ViewQuery.from('beer', 'by_name')
        .limit(ENTRIES_PER_PAGE)
        .stale(ViewQuery.Update.BEFORE);
    db.query(q, function(err, values) {
      // 'by_name' view's map function emits beer-name as key and value as
      // null. So values will be a list of
      //      [ {id: <beer-id>, key: <beer-name>, value: <null>}, ... ]

      // we will fetch all the beer documents based on its id.
      var keys = _.pluck(values, 'id');

      db.getMulti( keys, function(err, results) {

        // Add the id to the document before sending to template
        var beers = _.map(results, function(v, k) {
          v.value.id = k;
          return v.value;
        });

        res.render('beer/index', {'beers':beers});
      })
    });
  }
  app.get('/beers', list_beers);

  // List of brewery. Logic is same as above except that we will be gathering
  // brewery documents and rendering them.
  function list_breweries(req, res) {
    var q = ViewQuery.from('brewery', 'by_name')
        .limit(ENTRIES_PER_PAGE);
    db.query(q, function(err, results) {
      var breweries = _.map(results, function(v, k) {
        return {
          'id': v.id,
          'name': v.key
        };
      });

      res.render('brewery/index', {'breweries':breweries});
    });
  }
  app.get('/breweries', list_breweries);

  // Delete a beer document or brewery document. Document `id` is supplied as
  // part of the URL.
  function delete_object( req, res ) {
    db.remove( req.params.object_id, function(err, meta) {
      if( err ) {
        console.log( 'Unable to delete document `' + req.params.object_id + '`' );
      }

      res.redirect('/welcome');
    });
  }
  app.get('/beers/delete/:object_id', delete_object);
  app.get('/breweries/delete/:object_id', delete_object);



  // Show individual beer document, with all its details. Document `id` is
  // supplied as part of the URL.
  function show_beer(req, res) {
    db.get( req.params.beer_id, function(err, result) {
      var doc = result.value;
      if( doc === undefined ) {
        res.send(404);
      } else {
        doc.id = req.params.beer_id;

        var view = {
          'beer': doc,
          'beerfields': _.map(doc, function(v,k){return {'key':k,'value':v};})
        };
        res.render('beer/show', view);
      }
    });
  }
  app.get('/beers/show/:beer_id', show_beer);

  // Show individual brewery document, with all its details. Document `id` is
  // supplied as part of the URL.
  function show_brewery(req, res) {
    db.get( req.params.brewery_id, function(err, result) {
      var doc = result.value;

      if( doc === undefined ) {
        res.send(404);
      } else {
        doc.id = req.params.brewery_id;

        var view = {
          'brewery': doc,
          'breweryfields': _.map(doc, function(v,k){return {'key':k,'value':v};})
        };
        res.render('brewery/show', view);
      }
    });
  }
  app.get('/breweries/show/:brewery_id', show_brewery);

  // Edit beer document. This action handles both GET and POST method. In case
  // of GET method, it renders a form. And in case of POST it updates the
  // document in couchbase and redirects the client.
  function begin_edit_beer(req, res) {
    db.get(req.params.beer_id, function(err, result) {
      var doc = result.value;
      if( doc === undefined ) { // Trying to edit non-existing doc ?
        res.send(404);
      } else { // render form.
        doc.id = req.params.beer_id;
        var view = { is_create: false, beer: doc };
        res.render('beer/edit', view);
      }
    });
  }
  function done_edit_beer(req, res) {
    var doc = normalize_beer_fields(req.body);

    db.get( rc.doc.brewery_id, function(err, result) {
      if (result.value === undefined) { // Trying to edit non-existing doc ?
        res.send(404);
      } else {    // Set and redirect.
        db.upsert( req.params.beer_id, doc, function(err, doc, meta) {
          res.redirect('/beers/show/'+req.params.beer_id);
        })
      }
    });
  }
  app.get('/beers/edit/:beer_id', begin_edit_beer);
  app.post('/beers/edit/:beer_id', done_edit_beer);


  // Create a new beer document. Same as edit, only that we use add() API
  // instead of set() API.
  function begin_create_beer(req, res) {
    var view = { is_create : true, beer:{
      type: '',
      name: '',
      description: '',
      style: '',
      category: '',
      abv: '',
      ibu: '',
      srm: '',
      upc: '',
      brewery_id: ''
    } };
    res.render('beer/edit', view);
  }
  function done_create_beer(req, res) {
    var doc = normalize_beer_fields(req.body);
    var beer_id = doc.brewery_id.toLowerCase() + '-' +
                  doc.name.replace(' ', '-').toLowerCase();
    db.insert( beer_id, doc, function(err, result) {
      if (err) throw err;
      res.redirect('/beers/show/'+beer_id);
    });
  }
  app.get('/beers/create', begin_create_beer);
  app.post('/beers/create', done_create_beer);


  function search_beer(req, res) {
    var value = req.query.value;
    var q = ViewQuery.from('beer', 'by_name')
        .range(value, value + JSON.parse('"\u0FFF"'))
        .stale(ViewQuery.Update.BEFORE)
        .limit(ENTRIES_PER_PAGE);
    db.query(q, function(err, values) {
      var keys = _.pluck(values, 'id');
      if (keys.length <= 0) {
        return res.send([]);
      }
      db.getMulti(keys, function(err, results) {
        var beers = [];
        for(var k in results) {
          beers.push({
            'id': k,
            'name': results[k].value.name,
            'brewery_id': results[k].value.brewery_id
          });
        }

        res.send(beers);
      });
    });
  };
  app.get('/beers/search', search_beer);

  function search_brewery(req, res) {
    var value = req.query.value;
    var q = ViewQuery.from('beer', 'by_name')
        .range(value, value + JSON.parse('"\u0FFF"'))
        .limit(ENTRIES_PER_PAGE);
    db.query(q, function(err, results) {
      var breweries = [];
      for(var k in results) {
        breweries.push({
          'id': results[k].id,
          'name': results[k].key
        });
      }

      res.send(breweries);
    });
  };
  app.get('/breweries/search', search_brewery);

  // Start Express
  app.listen(1337);
  console.log('Server running at http://127.0.0.1:1337/');
}

// utility function to validate form submissions - creating / editing beer
// documents.
function normalize_beer_fields(data) {
  var doc = {};
  _.each(data, function(value, key) {
    if(key.substr(0,4) == 'beer') {
      doc[key.substr(5)] = value;
    }
  });

  if (!doc['name']) {
    throw new Error('Must have name');
  }
  if (!doc['brewery_id']) {
    throw new Error('Must have brewery ID');
  }

  return doc;
}
