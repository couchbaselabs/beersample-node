var http = require('http');
var fs = require('fs');
var path = require('path');
var qs = require('querystring');
var beer_designs = require('./beer_designs');

var _u = require('underscore');
var _s = require('underscore.string');
var M = require('mustache');
var couchbase = require('couchbase');

// connection configuration to pass on to couchbase.connect(). Note that
// while connecting with the server we are also opening the beer-sample
// bucket.
var config = {
    hosts : [ "localhost:8091" ],
    user : 'Administrator',
    password : 'password',
    debug : false,
    bucket : 'beer-sample'
}
var ENTRIES_PER_PAGE = 300;

// Respond with static CSS file.
function cssfile(db, req, res) {
    var file = path.join( __dirname, 'static', 'css', req.matchdict[1] );
    res.writeHead(200, {'Content-Type': 'text/css',
                        'Cache-Control': 'public,max-age=' + 3600 }); // 1 hour
    res.end( fs.readFileSync(file).toString() );
}

// Respond with static JS file.
function jsfile(db, req, res) {
    var file = path.join( __dirname, 'static', 'js', req.matchdict[1] );
    res.writeHead(200, {'Content-Type': 'text/javascript',
                        'Cache-Control': 'public,max-age=' + 3600 }); // 1 hour
    res.end( fs.readFileSync(file).toString() );
}

// Welcome page.
function welcome(db, req, res) {
    var partials = {
        body : fs.readFileSync('./templates/welcome.html').toString()
    }
    var tmpl = fs.readFileSync('./templates/layout.html').toString(); 
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end( M.render(tmpl, {}, partials) );
}

// List of beers.
function beers(db, req, res) {
    var q = { limit : ENTRIES_PER_PAGE,  // configure max number of entries.
              stale : false     // We don't want stale views here.
            };

    db.view( "beer", "by_name", q, function(err, values) {
        // 'by_name' view's map function emits beer-name as key and value as
        // null. So values will be a list of 
        //      [ {id: <beer-id>, key: <beer-name>, value: <null>}, ... ]
        
        // we will fetch all the beer documents based on its id.
        var keys = _u.pluck(values, 'id');
        db.get( keys, null, function(err, docvals, metas) {
            // Following gymnasitc is required for mustache templating.
            var beers = 
                _u.map( _u.zip(docvals, _u.pluck(metas, 'id')), function(z) {
                    z[0].id = z[1];
                    return {beer: z[0]};
                });
            var view = { 'beers' : beers };
            var partials = {
                body :fs.readFileSync('./templates/beer/index.html').toString()
            }
            var tmpl = fs.readFileSync('./templates/layout.html').toString();
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end( M.render(tmpl, view, partials) );
        })
    });
}

// List of brewery. Logic is same as above except that we will be gathering
// brewery documents and rendering them.
function breweries(db, req, res) {
    var q = { limit:ENTRIES_PER_PAGE };
    db.view( "brewery", "by_name", q, function(err, values) {
        var breweries = 
            _u.map( values, function( value ) {
                return {brewery: { id : value.id, name : value.key }};
            });
        var view = { 'breweries' : breweries };
        var partials = {
            body :fs.readFileSync('./templates/brewery/index.html').toString()
        }
        var tmpl = fs.readFileSync('./templates/layout.html').toString();
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end( M.render(tmpl, view, partials) );
    });
}

// Delete a beer document or brewery document. Document `id` is supplied as
// part of the URL.
function delobject( db, req, res ) {
    try {
        db.delete(req.matchdict[2]); // Refer to route() to know matchdict.
    } catch(e) {
        console.log( "Unable to delete document" + req.matchdict[2] );
    }
    res.writeHead(301, {Location : '/welcome'} );
    res.end();
}

// Show individual beer document, with all its details. Document `id` is
// supplied as part of the URL.
function show_beer(db, req, res) {
    var beer_id = req.matchdict[1]; // Refer to route() to know matchdict.
    db.get( beer_id, function(err, doc, meta) {
        if( doc === undefined ) {
            res.writeHead( 404, "Resource not found" );
            res.end();
        } else if( beer_id === meta.id ) {
            doc.id = meta.id;
            var view = { 
                'beer' : doc,
                'beerfields' : 
                    _u.map( _u.pairs(doc),
                            function(x) { return {key:x[0], value:x[1]} } )
            };
            var partials = {
                body : fs.readFileSync('./templates/beer/show.html').toString()
            }
            var tmpl = fs.readFileSync('./templates/layout.html').toString();
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end( M.render(tmpl, view, partials) );
        }
    });
}

// Show individual brewery document, with all its details. Document `id` is
// supplied as part of the URL.
function show_brewery(db, req, res) {
    var brewery_id = req.matchdict[1];
    db.get( brewery_id, function(err, doc, meta) {
        if( doc === undefined ) {
            res.writeHead( 404, "Resource not found" );
            res.end();
        } else if( brewery_id === meta.id ) {
            doc.id = meta.id;
            var view = { 
                'brewery' : doc,
                'breweryfields' : 
                    _u.map( _u.pairs(doc),
                            function(x) { return {key:x[0], value:x[1]} } )
            };
            var partials = {
              body :fs.readFileSync('./templates/brewery/show.html').toString()
            }
            var tmpl = fs.readFileSync('./templates/layout.html').toString();
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end( M.render(tmpl, view, partials) );
        }
    });
}

// Edit beer document. This action handles both GET and POST method. In case
// of GET method, it renders a form. And in case of POST it updates the
// document in couchbase and redirects the client.
function edit_beer(db, req, res) {
    var beer_id = req.matchdict[1];
    if( req.method == 'GET' ) {
        db.get(beer_id, function(err, doc, meta) {
            if( doc === undefined ) { // Trying to edit non-existing doc ?
                res.writeHead( 404, {} );
                res.end();
            } else if( beer_id === meta.id ) { // render form.
                doc.id = meta.id;
                var view = { is_create : false, beer : doc };
                var partials = {
                  body :fs.readFileSync('./templates/beer/edit.html').toString()
                }
                var tmpl = fs.readFileSync('./templates/layout.html').toString();
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end( M.render(tmpl, view, partials) );
            }
        });
    } else if( req.method == 'POST' ) {
        var rc = normalize_beer_fields( qs.parse( req.data ));
        if( rc.doc !== null ) {
            db.get( rc.doc.brewery_id, function(err, doc, meta) {
                if (doc === undefined) { // Trying to edit non-existing doc ?
                    res.writeHead( 400, {} );
                    res.end();
                } else {    // Set and redirect.
                    db.set( beer_id, rc.doc, function(err, doc, meta) {
                        res.writeHead(301, {Location : '/beers/show/'+beer_id});
                        res.end();
                    })
                }
            });
        } else {
            res.writeHead( rc.err[0], {} );
            res.end();
        }
    }
}

// Create a new beer document. Same as edit, only that we use add() API
// instead of set() API.
function create_beer(db, req, res) {
    if( req.method == 'GET' ) {
        var view = { is_create : true };
        var partials = {
            body : fs.readFileSync('./templates/beer/edit.html').toString()
        }
        var tmpl = fs.readFileSync('./templates/layout.html').toString();
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end( M.render(tmpl, view, partials) );
    } else if( req.method == 'POST' ) {
        var data = '';
        req.on('data', function(chunk) {
            data += chunk;
        });
        req.on('end', function() {
            var x = normalize_beer_fields( qs.parse( data ));
            if( x.doc ) {
                var beer_id = x.doc.brewery_id + '-' + 
                              x.doc.name.replace(' ', '-').toLowerCase();
                db.add( beer_id, x.doc, function(err, doc, meta) {
                    res.writeHead(301, {Location : '/beers/show/'+beer_id} );
                    res.end();
                })
            } else {
                res.writeHead( x.err[0], {} );
                res.end();
            }
        });
    }
}

function beer_search(db, req, res) {
    var value = request.args.get('value')
    var q = { startkey : value,
              endkey : value + JSON.parse('"\u0FFF"'),
              limit : ENTRIES_PER_PAGE }
    var results = [];
    db.view( "beer", "by_name", q, function(err, values) {
        var keys = _u.pluck(values, 'id');
        db.get( keys, null, function(err, docvals, metas) {
            results = 
                _u.map( _u.zip( docvals, _u.pluck(metas, 'id') ), function(z) {
                    return { 'id' : z[1], 'name' : z[0].name, 
                             'brewery_id' : z[0].brewery_id }
                });
            res.writeHead( 200, {'Content-Type' : 'application/json'});
            res.end( JSON.stringify(results) );
        });
    });
};

function brewery_search(db, req, res) {
    var value = request.args.get('value')
    var q = { startkey : value,
              endkey : value + JSON.parse('"\u0FFF"'),
              limit : ENTRIES_PER_PAGE }
    var results = [];
    db.view( "brewery", "by_name", q, function(err, values) {
        results = 
            _u.map( values, function(value) {
                return { 'id' : value.id, 'name' : value.name }
            });
        res.writeHead( 200, {'Content-Type' : 'application/json'});
        res.end( JSON.stringify(results) );
    });
};

// List of route patters and action callables.
var routes = [
    { patt : /\/css\/(.+)$/, action : cssfile },
    { patt : /\/js\/(.+)$/, action : jsfile },
    { patt : /\/$/, action : welcome },
    { patt : /\/welcome$/, action : welcome },
    { patt : /\/beers$/, action : beers },
    { patt : /\/beers\/show\/(.+)$/, action : show_beer },
    { patt : /\/beers\/edit\/(.+)$/, action : edit_beer },
    { patt : /\/beers\/create$/, action : create_beer },
    { patt : /\/beers\/search$/, action : beer_search },
    { patt : /\/breweries$/, action : breweries },
    { patt : /\/breweries\/show\/(.+)$/, action : show_brewery },
    { patt : /\/breweries\/search$/, action : brewery_search },
    { patt : /\/([^\/]+)\/delete\/(.+)$/, action : delobject }
]

// request url route matching, to resolve request to action callables.
// Uses the list of routes[] declared above.
// Actions are called with following arguments,
//   action( db, req, res );
//   where,
//      db - bucket interface supplied by couchbase.connect().
//      req - HTTP request object HTTP.IncomingMessage.
//      res - HTTP response object.
function route( bsbucket, req, res ) {
    var data = '';
    req.on('data', function(chunk) { data += chunk; }); // Collect data.
    req.on('end', function() {  // Done gathering the request.
        req.data = data;
        for(var i=0; i< routes.length; i++) {
            var rt = routes[i];
            var m = rt.patt.exec(req.url);
            if( m ) {
                req.matchdict = m;
                rt.action( bsbucket, req, res );
                console.log( 'HTTP Request : ' + m );
                break;
            }
        }
        if(i > routes.length) {
            console.log( 'Error: Could not handle request ' + req.url );
        }
    });
}

// utility function to validate form submissions - creating / editing beer
// documents.
function normalize_beer_fields(data) {
    var rc = { doc : {}, err : [ 400, "unknown error" ] };
    _u.each( data, function( value, key ) {
        if( _s.startsWith(key, 'beer') ) {
            rc.doc[ _s.splice(key, 0, 5) ] = value;
        }
    });
    if(! rc.doc['name'] ) {
        rc.err = [400, "Must have name"];
        rc.doc = null;
    } 
    if(! rc.doc['brewery_id'] ) {
        rc.err = [400, "Must have brewery ID"];
        rc.doc = null;
    }
    return rc
}

function main() {
    // Connect with couchbase server and get a bucket handler as call back.
    // All subsequent API calls to `couchbase` library is made via
    // bucket-handler `bsbucket`.
    couchbase.connect( config, function( err, bsbucket ) {
        if(err) {
            console.log("Unable to connect to server");
            process.exit(1);
        }
        http.createServer( _u.partial(route, bsbucket)
                         ).listen(1337, '127.0.0.1');
        console.log('Server running at http://127.0.0.1:1337/');
    });
}

if( require.main == module ) {
    argv = process.argv.splice(2);
    if( argv[0] === '-d' ) { // Create the design documents for beer-samples
        beer_designs.setup( config );
    } else if( argv[0] === '-r' ) {  // Reset what was done by -d option
        beer_designs.reset( config );
    } else {
        main();
    }
}
