var couchbase = require('couchbase');

// Setup design documents for beers and breweries to index beer-documents
// based on beer-names and index brewery-documents based on brewery-names.
exports.setup = function( config ) {
    var beer_by_name = {
        map : [ 'function(doc, meta) {',
                    'if (doc.type && doc.type == "beer") { ',
                        'emit(doc.name, null); }',
                '}'
              ].join('\n')
    }
    var breweries_by_name = {
        map : [ 'function(doc, meta) {',
                    'if (doc.type && doc.type == "brewery") { ',
                        'emit(doc.name, null); }',
                '}'
              ].join('\n')
    }

    couchbase.connect( config, function( err, bsbucket ) {
        if(err) {
            console.log("Unable to connect to server");
            console.log(config);
            process.exit(1);
        }
        // Update the beer view, to index beers `by_name`.
        bsbucket.getDesignDoc( "beer", function( err, ddoc, meta ) {
            if(! ('by_name' in ddoc['views']) ) {
                ddoc.views.by_name = beer_by_name;
                bsbucket.setDesignDoc( "beer", ddoc, function( err, res ) {
                    if(err) {
                        console.log( 'ERROR' + err );
                    } else if (res.ok) {
                        console.log( 'Updated ' + res.id );
                    }
                });
            }
        })
        // Update or create the brewery view, to index brewery or `by_name`.
        bsbucket.getDesignDoc( "brewery", function( err, ddoc, meta ) {
            try {
                if(! ('by_name' in ddoc['views']) ) {
                    console.log("Updating the brewery view");
                    ddoc['views']['by_name'] = breweries_by_name;
                    bsbucket.setDesignDoc( "brewery", ddoc, function( err, res ) {
                        if(err) {
                            console.log( 'ERROR' + err );
                        } else if (res.ok) {
                            console.log( 'Updated ' + res.id );
                        }
                    });
                }
            } catch(e) {
                console.log( "Creating the brewery view" );
                breweries_design = { views : {by_name : breweries_by_name} };
                bsbucket.setDesignDoc( "brewery", breweries_design, function() {
                    if(err) {
                        console.log( 'ERROR' + err );
                    } else if (res.ok) {
                        console.log( 'Updated ' + res.id );
                    }
                });
            };
        });
    })
}

exports.reset = function( config ) {
    couchbase.connect( config, function( err, bsbucket ) {
        // Update the beer view, to index beers `by_name`.
        bsbucket.getDesignDoc( "beer", function( err, ddoc, meta ) {
            delete ddoc['views']['by_name'];
            bsbucket.setDesignDoc( "beer", ddoc, function( err, res ) {
                if(err) {
                    console.log( 'ERROR' + err );
                } else if (res.ok) {
                    console.log( 'Updated ' + res.id );
                }
            });
        })
        // Update or create the brewery view, to index brewery or `by_name`.
        bsbucket.deleteDesignDoc( "brewery", function() {
            console.log(arguments);
        });
    })
}
