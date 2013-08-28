var couchbase = require('couchbase');

// Setup design documents for beers and breweries to index beer-documents
// based on beer-names and index brewery-documents based on brewery-names.

// The following functions acts synchronously so that we can know when to safely
//   exit.  This is a workaround for a current bug in the client that stops node
//   from gracefully exiting while a Couchbase connection is active.
  
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

    var bsbucket = new couchbase.Connection( config, function( err ) {
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
                    
                    // Update or create the brewery view, to index brewery or `by_name`.
                    bsbucket.getDesignDoc( "brewery", function( err, ddoc, meta ) {
                      if (err) {
                        console.log( "Creating the brewery view" );
                        breweries_design = { views : {by_name : breweries_by_name} };
                        bsbucket.setDesignDoc( "brewery", breweries_design, function(err) {
                          if(err) {
                              console.log( 'ERROR' + err );
                          } else if (res.ok) {
                              console.log( 'Updated ' + res.id );
                          }
                          
                          process.exit(0);
                        });
                      } else {
                        if(! ('by_name' in ddoc['views']) ) {
                          console.log("Updating the brewery view");
                          ddoc['views']['by_name'] = breweries_by_name;
                          bsbucket.setDesignDoc( "brewery", ddoc, function( err, res ) {
                            if(err) {
                              console.log( 'ERROR' + err );
                            } else if (res.ok) {
                              console.log( 'Updated ' + res.id );
                            }
                            
                            process.exit(0);
                          });
                        }
                      }
                    });
                    
                });
            }
        })
    })
}

exports.reset = function( config ) {  
  var bsbucket = new couchbase.Connection( config, function( err ) {
    if(err) {
      console.error("Failed to connect to cluster: " + err);
      process.exit(1);
    }

    // Update the beer view, to index beers `by_name`.
    bsbucket.getDesignDoc( "beer", function( err, ddoc, meta ) {
      console.log(err);
      console.log('get done');
      
      delete ddoc['views']['by_name'];
      bsbucket.setDesignDoc( "beer", ddoc, function( err, res ) {
        console.log('set done');
        
        if(err) {
            console.log( 'ERROR' + err );
        } else if (res.ok) {
            console.log( 'Updated ' + res.id );
        }
       
        // Update or create the brewery view, to index brewery or `by_name`.
        bsbucket.removeDesignDoc( "brewery", function(err, res) {
          console.log('delete done');
            console.log(err);
            
            process.exit(0);
        });
        
      });
    })
  })
}
