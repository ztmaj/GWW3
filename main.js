/*******************************************************************************
 * main.js
 *
 *
 ******************************************************************************/

/*******************************************************************************
 * Global var definde
 *
 *
 ******************************************************************************/
var τ = 2 * Math.PI;
var MAX_TASK_TIME = 100;  // amount of time before a task yields control (milliseconds)
var MIN_SLEEP_TIME = 25;  // amount of time a task waits before resuming (milliseconds)
var INVISIBLE = -1;  // an invisible vector
var NIL = -2;       // non-existent vector

var columns = [];
var nilVector = [NaN, NaN, NIL];

var animateCanceled = true;
var particles = [];
var tileLayerArray = new Array();

var map = L.map('map',{
        zoomControl: true,
        attributionControl: false,
        center: [39, 116],
        maxZoom: 10,
        zoom: 5,
        fullscreenControl: true,
        timeDimension: true,
        timeDimensionOptions:{
            timeInterval: "2016-11-6/2016-11-20",
            period: "PT1H"    
            },
        timeDimensionControl: true,
        timeDimensionControlOptions:{
        timeSteps: 12
        },    
        contextmenu: true,
        contextmenuWidth: 140,
        contextmenuItems: [{
          text: 'Show coordinates',
          callback: showCoordinates
        }, {
          text: 'Center map here',
          callback: centerMap
        }]     
    });


/*******************************************************************************
 * interpolate
 *
 *
 ******************************************************************************/

/**
 * An object {width:, height:} that describes the extent of the browser's view in pixels.
 */
var view = function() {
    var w = window, d = document.documentElement, b = document.getElementsByTagName("body")[0];
    var x = w.innerWidth || d.clientWidth || b.clientWidth;
    var y = w.innerHeight || d.clientHeight || b.clientHeight;
    //var x = 600;
    //var y = 400;
    return {width: x, height: y};
}();

function asColorStyle(r, g, b, a) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
}


function init() {
    // Modify the display elements to fill the screen.
    /*
    d3.select(MAP_SVG_ID).attr("width", view.width).attr("height", view.height);
    d3.select(FIELD_CANVAS_ID).attr("width", view.width).attr("height", view.height);
    d3.select(OVERLAY_CANVAS_ID).attr("width", view.width).attr("height", view.height);
    */

}


/**
 * Returns an object holding parameters for the animation engine, scaled for view size and type of browser.
 * Many of these values are chosen because they look nice.
 *
 * @param topo a TopoJSON object holding geographic map data and its bounding box.
 */
function createSettings() {
    var isFF = /firefox/i.test(navigator.userAgent);
    var bounds = {x:0, y:0, width:view.width, height:view.height};
    var styles = [];
    var settings = {
        displayBounds: bounds,
        particleCount: document.getElementById("density").value,//temp default: Math.round(bounds.height / 0.24)
        maxParticleAge: document.getElementById("length").value,  // max number of frames a particle is drawn before regeneration
        velocityScale: +(bounds.height / 700).toFixed(3),  // particle speed as number of pixels per unit vector
        fieldMaskWidth: isFF ? 2 : Math.ceil(bounds.height * 0.06),  // Wide strokes on FF are very slow
        fadeFillStyle: isFF ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)",  // FF Mac alpha behaves differently
        frameRate: document.getElementById("frameRate").value,  // desired milliseconds per frame
        styles: styles,
        styleIndex: function(m) {  // map wind speed to a style
            return Math.floor(Math.min(m, 10) / 10 * (styles.length - 1));
        }
    };
    for (var j = 85; j <= 255; j += 5) {
        styles.push(asColorStyle(j, j, j, 1));
    }
    return settings;
}

/**
 * Returns a random number between min (inclusive) and max (exclusive).
 */
function rand(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Converts a meteorological wind vector to a u,v-component vector in pixel space. For example, given wind
 * from the NW at 2 represented as the vector [315, 2], this method returns [1.4142..., 1.4142...], a vector
 * (u, v) with magnitude 2, which when drawn on a display would point to the SE (lower right). See
 * http://mst.nerc.ac.uk/wind_vect_convs.html.
 */
function componentize(wd, wv) {
    var φ = wd / 360 * τ;  // meteorological wind direction in radians
    var m = wv;  // wind velocity, m/s
    var u = -m * Math.sin(φ);  // u component, zonal velocity
    var v = -m * Math.cos(φ);  // v component, meridional velocity
    return [u, -v];  // negate v because pixel space grows downwards
}

/**
 * Returns the index of v in array a (adapted from Java and darkskyapp/binary-search).
 */
function binarySearch(a, v) {
    var low = 0, high = a.length - 1;
    while (low <= high) {
        var mid = low + ((high - low) >> 1), p = a[mid];
        if (p < v) {
            low = mid + 1;
        }
        else if (p === v) {
            return mid;
        }
        else {
            high = mid - 1;
        }
    }
    return -(low + 1);
}


/**
 * Returns a function f(x, y) that defines a vector field. The function returns the vector nearest to the
 * point (x, y) if the field is defined, otherwise the "nil" vector [NaN, NaN, NIL (-2)] is returned. The method
 * randomize(o) will set {x:, y:} to a random real point somewhere within the field's bounds.
 */
function createField(columns) {
//    var nilVector = [NaN, NaN, NIL];
    var field = function(x, y) {
        var column = columns[Math.round(x)];
        if (column) {
            var v = column[Math.round(y) - column[0]];  // the 0th element is the offset--see interpolateColumn
            if (v) {
                return v;
            }
        }
        return nilVector;
    };

    // Create a function that will set a particle to a random location in the field. To do this uniformly and
    // efficiently given the field's sparse data structure, we build a running sum of column widths, starting at 0:
    //     [0, 10, 25, 29, ..., 100]
    // Each value represents the index of the first point in that column, and the last element is the total
    // number of points. Choosing a random point means generating a random number between [0, total), then
    // finding the column that contains this point by doing a binary search on the array. For example, point #27
    // corresponds to w[2] and therefore columns[2]. If columns[2] has the form [1041, a, b, c, d], then point
    // #27's coordinates are {x: 2, y: 1043}, where 1043 == 27 - 25 + 1 + 1041, and the value at that point is 'c'.

    field.randomize = function() {
        var w = [0];
        for (var i = 1; i <= columns.length; i++) {
            var column = columns[i - 1];
            w[i] = w[i - 1] + (column ? column.length - 1 : 0);
        }
        var pointCount = w[w.length - 1];

        return function(o) {
            var p = Math.floor(rand(0, pointCount));  // choose random point index
            var x = binarySearch(w, p);  // find column that contains this point
            x = x < 0 ? -x - 2 : x;  // when negative, x refers to _following_ column, so flip and go back one
            while (!columns[o.x = x]) {  // skip columns that have no points
                x++;
            }
            // use remainder of point index to index into column, then add the column's offset to get actual y
            o.y = p - w[x] + 1 + columns[x][0];
            return o;
        }
    }();

    return field;
}


//temp
function fieldrandomize(o) {
    o.x = Math.floor(rand(0, view.width));
    o.y = Math.floor(rand(0, view.height));
    return o;
}

var field1 = function(x, y) {
    var column = columns[Math.round(x)];
    if (column) {
        var v = column[Math.round(y)];  // the 0th element is the offset--see interpolateColumn
        if (v) {
            return v;
        }
    }
    return nilVector;
};



/**
 * Returns a promise for a vector field function (see createField). The vector field uses the sampling stations'
 * data to interpolate a vector at each point (x, y) in the specified field mask. The vectors produced by this
 * interpolation have the form [dx, dy, m] where dx and dy are the rectangular components of the vector and m is
 * the magnitude dx^2 + dy^2. If the vector is not visible because it lies outside the display mask, then m
 * has the value INVISIBLE (-1).
 */
function interpolateField() {
    var d = when.defer();
    var points = [];
    
    $.ajaxSettings.async = false; 
    $.getJSON('data/dataWind.json',function(json){
        for(var k in json.data) {
            var strs=k.split("_");
            var value = componentize(json.data[k][0], json.data[k][1]);
            points.push([strs[0], strs[1], value]);
	    //console.log("k:"+k);
	    //console.log("json.data[k]:"+json.data[k]);
	    //console.log("strs:"+strs);
	    //console.log("value: "+ value);
        }
        //goldwindEarth_wind.json

    });

    if (points.length < 5) {
        return d.reject("points.length < 5");
    }

    var interpolate = mvi.inverseDistanceWeighting(points, 5);  // Use the five closest neighbors

//    var columns = [];
    var bounds = settings.displayBounds;
    //var displayMask = masks.displayMask;
    //var fieldMask = masks.fieldMask;
    var xBound = bounds.x + bounds.width;  // upper bound (exclusive)
    var yBound = bounds.y + bounds.height;  // upper bound (exclusive)
    var x = bounds.x;

    function interpolateColumn(x) {
        // Find min and max y coordinates in the column where the field mask is defined.
        var yMin = bounds.y+1, yMax = yBound-1;

        if (yMin <= yMax) {
            // Interpolate a vector for each valid y in the column. A column may have a long empty region at
            // the front. To save space, eliminate this empty region by encoding an offset in the column's 0th
            // element. A column with only three points defined at y=92, 93 and 94, would have an offset of 91
            // and a length of four. The point at y=92 would be column[92 - column[0]] === column[1].

            var column = [];
            var offset = column[0] = yMin - 1;
            for (var y = yMin; y <= yMax; y++) {
                var v = null;
                v = [0, 0, 0];
                v = interpolate(x, y, v);
                v[2] = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
                v = mvi.scaleVector(v, settings.velocityScale);
                column[y - offset] = v;
            }
            return column;
        }
        else {
            return null;
        }
    }

    (function batchInterpolate() {
        try {
            var start = +new Date;
            while (x < xBound) {
                columns[x] = interpolateColumn(x);
                x += 1;
                if ((+new Date - start) > MAX_TASK_TIME) {
                    // Interpolation is taking too long. Schedule the next batch for later and yield.
                    setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                    return;
                }
            }
            d.resolve(createField(columns));
        }
        catch (e) {
            d.reject(e);
        }
    })();

    return d.promise;
}


/**
 * Draw particles with the specified vector field. Frame by frame, each particle ages by one and moves according to
 * the vector at its current position. When a particle reaches its max age, reincarnate it at a random location.
 *
 * Per frame, draw each particle as a line from its current position to its next position. The speed of the
 * particle chooses the line style--faster particles are drawn with lighter styles. For performance reasons, group
 * particles of the same style and draw them within one beginPath()-stroke() operation.
 *
 * Before each frame, paint a very faint alpha rectangle over the entire canvas to provide a fade effect on the
 * particles' previously drawn trails.
 */
function animate(settings, field, g) {
    var bounds = settings.displayBounds;
    var buckets = settings.styles.map(function() { return []; });
    for (var i = 0; i < settings.particleCount; i++) {
        particles.push(fieldrandomize({age: rand(0, settings.maxParticleAge)}));
    }

    function evolve() {
        buckets.forEach(function(bucket) { bucket.length = 0; });
        particles.forEach(function(particle) {
            if (particle.age > settings.maxParticleAge) {
                fieldrandomize(particle).age = 0;
            }
            var x = particle.x;
            var y = particle.y;
            var v = field(x, y);  // vector at current position
            var m = v[2];
            if (m === NIL) {
                particle.age = settings.maxParticleAge;  // particle has escaped the grid, never to return...
            }
            else {
                var xt = x + v[0];
                var yt = y + v[1];
                if (m > INVISIBLE && field(xt, yt)[2] > INVISIBLE) {
                    // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                    particle.xt = xt;
                    particle.yt = yt;
                    buckets[settings.styleIndex(m)].push(particle);
                }
                else {
                    // Particle isn't visible, but it still moves through the field.
                    particle.x = xt;
                    particle.y = yt;
                }
            }
            particle.age += 1;
        });
    }

    g.lineWidth = document.getElementById("thickness").value; //add by maj default:1.0
    g.fillStyle = settings.fadeFillStyle;

    function draw() {
        // Fade existing particle trails.
        var prev = g.globalCompositeOperation;
        g.globalCompositeOperation = "destination-in";
        g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        g.globalCompositeOperation = prev;

        // Draw new particle trails.
        buckets.forEach(function(bucket, i) {
            if (bucket.length > 0) {
                g.beginPath();
                g.strokeStyle = settings.styles[i];
                bucket.forEach(function(particle) {
                    g.moveTo(particle.x, particle.y);
                    g.lineTo(particle.xt, particle.yt);
                    particle.x = particle.xt;
                    particle.y = particle.yt;
                });
                g.stroke();
            }
        });
    }

    (function frame() {
        try {
            if (!animateCanceled) {
                // var start = +new Date;
                evolve();
                draw();
                // var duration = (+new Date - start);
                //console.log(settings.frameRate);
                setTimeout(frame, settings.frameRate /* - duration*/);
            }
        }
        catch (e) {
            //log.error(e);
        }
    })();

    settings.stopAnimation = function cancel() {
        animateCanceled = true;
    };
}

/////////////////////////////////////////////////////////////////////////////
//
//Page Layout Control
//
/////////////////////////////////////////////////////////////////////////////


/*****************************
*****Geocoder control Control*****
*****************************/
var geocoder = L.control.geocoder('search-MKZrG6M', {
    fullWidth: 650,
    expanded: true,
    position: 'topright',
    markers: true
}).addTo(map);

var geoContainer = geocoder.getContainer();

//
/*****************************
*****Locate  Control*****
*****************************/
L.control.locate({
        position: 'topright'
    }).addTo(map);

//Scale control
L.control.scale({
        imperial:false,
        position: 'bottomright'
    }).addTo(map);

//Measure control
L.Control.measureControl({
        position: 'topright'
    }).addTo(map);


/*
var zoom = L.control.zoom(
        position: 'topright'
    ).addTo(map);
*/

//Sidebar control
var sidebar = L.control.sidebar('sidebar',{
        //position: 'topleft'
    }).addTo(map);


//Slider control
/*
$('select#valueAA').selectToUISlider({

});
*/

//fix color
fixToolTipColor();

//quick function for tooltip color match
function fixToolTipColor(){
//grab the bg color from the tooltip content - set top border of pointer to same
    $('.ui-tooltip-pointer-down-inner').each(function(){
        var bWidth = $('.ui-tooltip-pointer-down-inner').css('borderTopWidth');
        var bColor = $(this).parents('.ui-slider-tooltip').css('backgroundColor')
        $(this).css('border-top', bWidth+' solid '+bColor);
    });
}

//temp
/*
marker.bindTooltip("my tooltip text").openTooltip();
marker.bindPopup("<b>Hello world!</b><br>I am a popup.").openPopup();
*/

//var marker=L.marker([39, 116]).addTo(map);

map.on('click', function(e) {
    var latlng = "";
    if (e.latlng.lat>=0){
        latlng = latlng + e.latlng.lat.toFixed(2) + "°N ";
    }
    else{
        latlng = latlng + (-e.latlng.lat.toFixed(2)) + "°S ";
    }

    if (e.latlng.lng>=0){
        latlng = latlng + e.latlng.lng.toFixed(2) + "°E";
    }
    else{
        latlng = latlng + (-e.latlng.lng.toFixed(2)) + "°W";
    }
    
    document.getElementById("chart-latlng").innerHTML = latlng;
    document.getElementById("radar-latlng").innerHTML = latlng;

    MeteoblueAdd (e);
    HisDataAdd (e);
    RadarAdd (e);

});


//Baselayer control
/**/

var layer0 = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoienRtYWppYSIsImEiOiJjaXQ3NXZ1b3UwMDBqMnlwaG5ybzc3eG1tIn0.2yhUZ1f7SFjPFwKSEYHj6g', {
        maxZoom: 18,
        id: 'mapbox.light'
    }).addTo(map);
var layer1 = L.tileLayer('http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: "1234"
    });
var layer2_1 = L.tileLayer('http://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
        subdomains: "1234"
    });
var layer2_2 = L.tileLayer('http://t{s}.tianditu.cn/DataServer?T=cta_w&X={x}&Y={y}&L={z}', {
        subdomains: "1234"
    });
var layer3 = L.tileLayer('http://t{s}.tianditu.cn/DataServer?T=vec_w&X={x}&Y={y}&L={z}', {
        subdomains: "1234"
    });
var layer4 = L.tileLayer('http://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineStreetPurplishBlue/MapServer/tile/{z}/{y}/{x}');
var baseLayers = {
    "OSM地图": layer0,
    "高德地图": layer1,
    '高德影像': L.layerGroup([layer2_1, layer2_2]),
    '天地图': layer3,
    //'GeoQ灰色底图': L.tileLayer('http://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineStreetPurplishBlue/MapServer/tile/{z}/{y}/{x}').addTo(map)
    'GeoQ灰色底图': layer4
};





var layercontrol = L.control.layers(baseLayers, {
    //position: "topleft"
}).addTo(map);

tileLayerArray.push(layer0);
tileLayerArray.push(layer1);
tileLayerArray.push(layer2_1);
tileLayerArray.push(layer2_2);
tileLayerArray.push(layer3);
tileLayerArray.push(layer4);


/**************************
*****Page Layout Control*****
****************************/

//MarkerFilter
var IconWindFarm = L.icon({
    iconUrl: './images/wind_wheel.png',
    iconSize: [32, 32],
    iconAnchor: [22, 94],
    popupAnchor: [-3, -76]
    //shadowUrl: 'my-icon-shadow.png',
    //shadowSize: [68, 95],
    //shadowAnchor: [22, 94]
});

var IconWeatherStation = L.icon({
    iconUrl: './images/weather_station.png',
    iconSize: [32, 32],
    iconAnchor: [22, 94],
    popupAnchor: [-3, -76]
    //shadowUrl: 'my-icon-shadow.png',
    //shadowSize: [68, 95],
    //shadowAnchor: [22, 94]
});

//create wind farm marker
var markWindFarm1 = L.marker([42.556081, 117.677574], { tags: ['WindFarm'],icon: IconWindFarm });
markWindFarm1.addTo(map).bindPopup('围场 红松洼(金风)');
var markWindFarm2 = L.marker([41.113574, 114.25874], { tags: ['WindFarm'],icon: IconWindFarm });
markWindFarm2.addTo(map).bindPopup('尚义 大满井(GE)');
var markWindFarm3 = L.marker([41.869509, 114.492587], { tags: ['WindFarm'],icon: IconWindFarm });
markWindFarm3.addTo(map).bindPopup('康保 卧龙兔山(GE)');
var markWindFarm4 = L.marker([45.613298, 122.837394], { tags: ['WindFarm'],icon: IconWindFarm });
markWindFarm4.addTo(map).bindPopup('白城 查干浩特(金风)');
var markWindFarm5 = L.marker([37.256695, 120.886997], { tags: ['WindFarm'],icon: IconWindFarm });
markWindFarm5.addTo(map).bindPopup('栖霞 唐山硼(金风)');

map.removeLayer(markWindFarm1);
map.removeLayer(markWindFarm2);
map.removeLayer(markWindFarm3);
map.removeLayer(markWindFarm4);
map.removeLayer(markWindFarm5);

//create weather station marker
var markWeatherStation1 = L.marker([47.1,119.56], { tags: ['WeatherStation'],icon: IconWeatherStation});
markWeatherStation1.addTo(map).bindPopup('阿尔山');
var markWeatherStation2 = L.marker([47.13,119.45], { tags: ['WeatherStation'],icon: IconWeatherStation});
markWeatherStation2.addTo(map).bindPopup('海拉尔');
var markWeatherStation3 = L.marker([45.38,122.5], { tags: ['WeatherStation'],icon: IconWeatherStation});
markWeatherStation3.addTo(map).bindPopup('白城');
var markWeatherStation4 = L.marker([46.03,88.24], { tags: ['WeatherStation'],icon: IconWeatherStation});
markWeatherStation4.addTo(map).bindPopup('哈巴河');
var markWeatherStation5 = L.marker([39.46,98.29], { tags: ['WeatherStation'],icon: IconWeatherStation});
markWeatherStation5.addTo(map).bindPopup('酒泉');

map.removeLayer(markWeatherStation1);
map.removeLayer(markWeatherStation2);
map.removeLayer(markWeatherStation3);
map.removeLayer(markWeatherStation4);
map.removeLayer(markWeatherStation5);

//create FilterButton
L.control.tagFilterButton({
    position: 'topright',
    data: ['WindFarm', 'WeatherStation'], 
    icon: '<img src="public/filter-button/filter.png">',
    onSelectionComplete: function(tags) {
        map.removeLayer(markWindFarm1);
        map.removeLayer(markWindFarm2);
        map.removeLayer(markWindFarm3);
        map.removeLayer(markWindFarm4);
        map.removeLayer(markWindFarm5);

        map.removeLayer(markWeatherStation1);
        map.removeLayer(markWeatherStation2);
        map.removeLayer(markWeatherStation3);
        map.removeLayer(markWeatherStation4);
        map.removeLayer(markWeatherStation5);

        for (i in tags) {
            if (tags[i] == 'WindFarm'){
                markWindFarm1.addTo(map);
                markWindFarm2.addTo(map);
                markWindFarm3.addTo(map);
                markWindFarm4.addTo(map);
                markWindFarm5.addTo(map);
            }
            
            if (tags[i] == 'WeatherStation'){
                markWeatherStation1.addTo(map);
                markWeatherStation2.addTo(map);
                markWeatherStation3.addTo(map);
                markWeatherStation4.addTo(map);
                markWeatherStation5.addTo(map);
            }
        }
    }
}).addTo( map );


/*****************************
*****Time Dimension Control*****
*****************************/
//var proxy = 'public/TimeDimension/examples/server/proxy.php';
//var testWMS = "http://glues.pik-potsdam.de:8080/thredds/wms/pik_wcrp_cmip3/ncar_pcm1_sresb1_2006-2099_tmp.nc";
var testWMS = "http://localhost"
var testLayer = L.tileLayer.wms(testWMS, {
    layers: 'tmp',
    format: 'public/TimeDimension/examples/image/png',
    transparent: true
    //attribution: '<a href="https://www.pik-potsdam.de/">PIK</a>'
});
var testTimeLayer = L.timeDimension.layer.wms(testLayer/*, {proxy: proxy}*/);
testTimeLayer.addTo(map);

/*
var testLegend = L.control({
    position: 'topright'
});

testLegend.onAdd = function(map) {
    var src = testWMS + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=tmp&PALETTE=tmp";
    var div = L.DomUtil.create('div', 'info legend');
    div.innerHTML +=        '<img src="' + src + '" alt="legend">';
    return div;
};
testLegend.addTo(map);
*/


/*****************************
*****Context Control************
*****************************/
function showCoordinates (e) {
    var popup = L.popup();
    popup.setLatLng(e.latlng)
        .setContent("当前坐标: " + e.latlng.toString())
        .openOn(map);
}

function centerMap (e) {
  map.panTo(e.latlng);
}

function MeteoblueAdd (e) {
    var latlng = "";
    if (e.latlng.lat>=0){
        latlng = latlng + e.latlng.lat + "N";
    }
    else{
        latlng = latlng + (-e.latlng.lat) + "S";
    }

    if (e.latlng.lng>=0){
        latlng = latlng + e.latlng.lng + "E";
    }
    else{
        latlng = latlng + (-e.latlng.lng) + "W";
    }
    
    //"39N116E8";
    /*document.getElementById('meteoblue').src="https://www.meteoblue.com/en/weather/widget/three/"+latlng+"_Asia%2FShanghai?geoloc=fixed&days=4&tempunit=CELSIUS&windunit=KILOMETER_PER_HOUR&layout=image" */
    document.getElementById('meteoblue').src="https://www.meteoblue.com/en/weather/widget/daily/"+latlng+"_Asia%2FShanghai?geoloc=fixed&days=4&tempunit=CELSIUS&windunit=KILOMETER_PER_HOUR&coloured=coloured&pictoicon=1&maxtemperature=1&mintemperature=1&windspeed=1&winddirection=1&precipitation=1&precipitationprobability=1&spot=1&layout=light";
}

function HisDataAdd (e) {
    var myChart = echarts.init(document.getElementById('chart-data'));
    option = {
      title: {
          text: '历史数据柱状图对比'
      },
      tooltip: {
          trigger: 'axis'
      },
      xAxis: [{
          type: 'category',
          data: ['7月', '8月', '9月', '10月']
      }],
      yAxis: [{
          type: 'value',
          name: '风量',
          min: 0,
          max: 10,
          interval: 1,
          axisLabel: {
              formatter: '{value} m3/h'
          }
      }, {
          type: 'value',
          name: '温度',
          min: -10,
          max: 10,
          interval: 1,
          axisLabel: {
              formatter: '{value} °C'
          }
      }],
      series: [{
          name: '风量',
          type: 'bar',
          data: [Math.random()*10, Math.random()*10, Math.random()*10, Math.random()*10]
      }, {
          name: '温度',
          type: 'bar',
          data: [Math.random()*10, Math.random()*10, Math.random()*10, Math.random()*10]
      }]
    };

    myChart.setOption(option);
}

function RadarAdd(e){
    var myChart = echarts.init(document.getElementById('radar-data'));
    option = {
        title: {
            text: '风场选址各维度条件评估'
        },
        tooltip: {},
        //legend: {
            //data: ['风场平均', '该点数据']    
        //},
        radar: {
            // shape: 'circle',
            indicator: [
                { name: '平均风速', max: 100},
                { name: '风功率密度', max: 100},
                { name: '主要风向分布', max: 100},
                { name: '年风能可利用时间', max: 100},
                { name: '地势平坦度', max: 100},
                { name: '灾害发生频率', max: 100}
            ]    
        },
        series: [{
            name: '风场选址各维度条件评估',
            type: 'radar',
            // areaStyle: {normal: {}}, 
            data : [
                {
                    value : [(Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2)],
                    name : '风场平均'
                },
                {
                    value : [(Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2), 
                            (Math.random()*100).toFixed(2)],
                    name : '该点数据'
                }
            ]
        }]
    };
    myChart.setOption(option);

}


/*****************************
*****Leaflet Heat ***************
*****************************/
// lat, lng, intensity
var addressPoints = [
    //[30, 116, 10],
    //[35, 116, 70],
    //[40, 116, 100],
    //[45, 116, 150]
];

var heat = L.heatLayer(addressPoints,{
    radius: 10,
    blur: 10,
    gradient: {0:'Blue', 0.5:'yellow', 1:'red'  }
}).addTo(map);

/*****************************
*****Color Scale ***************
*****************************/


/////////////////////////////////////////////////////////////////////////////
//
//Layer Render
//
/////////////////////////////////////////////////////////////////////////////


//temp 
var settings = createSettings();

//temp 
interpolateField();

///////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////
/*
http://api.map.baidu.com/cloudgc/v1?ak=hrkqC4eAeVR1pxfm92aYAZqdZYV0CLVg&address=%E5%8C%97%E4%BA%AC%E5%B8%82%E6%B5%B7%E6%B7%80%E5%8C%BA%E4%B8%8A%E5%9C%B0%E5%8D%81%E8%A1%9710%E5%8F%B7&city=%E5%8C%97%E4%BA%AC
*/


var BigPointLayer = L.CanvasLayer.extend({
  renderCircle: function(ctx, point, radius) {
    ctx.fillStyle = 'rgba(255, 60, 60, 0.2)';
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2.0, true, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },

  render: function() {
    var canvas = this.getCanvas();
    var ctx = canvas.getContext('2d');
/*
    // clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // get center from the map (projected)
    //var point = this._map.latLngToContainerPoint(new L.LatLng(39,116));

    // render
    //this.renderCircle(ctx, point, (1.0 + Math.sin(Date.now()*0.001))*300);
*/

//temp 
    animate(settings, field1, ctx);

    //this.redraw();
  },
  
  clearCanvas: function() {
    var canvas = this.getCanvas();
    var ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
});

var layer = new BigPointLayer();
layer.addTo(map);

/////////////////////////////////////////////////////////////////////////////
//
//Others
//
/////////////////////////////////////////////////////////////////////////////
function submitForm () {
    animateCanceled = true;

    //clear
    layer.clearCanvas();
    particles = [];

    //set value
    settings.particleCount = document.getElementById("density").value;
    settings.frameRate = document.getElementById("frameRate").value;
    settings.maxParticleAge = document.getElementById("length").value;
    if (document.getElementById("windopen").checked == true){
        animateCanceled = false;
    }else{
        animateCanceled = true;
    }

    for (tilelayer in tileLayerArray){
        tileLayerArray[tilelayer].setOpacity(document.getElementById("backgroundopacity").value);
        //console.log(tilelayer);
    }

    //redraw
    window.setTimeout('layer.render()', 1000);
}

function submitFormOverlay () {

    var overlayFlag = true;
    if (document.getElementById("overlaytypeNo").checked == true){
        document.getElementById("colorscaleMinValue").innerHTML = "";
        document.getElementById("colorscaleMaxValue").innerHTML = "";
        overlayFlag = false;
    } else{
        if (document.getElementById("overlaytypeWind").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "0 Km/h";
            document.getElementById("colorscaleMaxValue").innerHTML = "220 Km/h";        
        } else if (document.getElementById("overlaytypeTemp").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "-52 ℃";
            document.getElementById("colorscaleMaxValue").innerHTML = "47 ℃";   
        } else if (document.getElementById("overlaytypeHumidity").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "0 %";
            document.getElementById("colorscaleMaxValue").innerHTML = "100 %"; 
        } else if (document.getElementById("overlaytypeOzone").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "1 mg/m³";
            document.getElementById("colorscaleMaxValue").innerHTML = "10 mg/m³";
        } else if (document.getElementById("overlaytypeRain").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "1 cm";
            document.getElementById("colorscaleMaxValue").innerHTML = "100 cm";
        } else if (document.getElementById("overlaytypeSnow").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "1 cm";
            document.getElementById("colorscaleMaxValue").innerHTML = "100 cm";
        } else if (document.getElementById("overlaytypePressure").checked == true){
            document.getElementById("colorscaleMinValue").innerHTML = "0.1 mPa";
            document.getElementById("colorscaleMaxValue").innerHTML = "100 mPa";
        }
    }

    // refresh overlay
    addressPoints.splice(0, addressPoints.length);

    if (overlayFlag == true)
    {        
        /*
        var Min_x = map.getBounds().getWest();
        var Max_x = map.getBounds().getEast();
        var Min_y = map.getBounds().getSouth();
        var Max_y = map.getBounds().getNorth();

        for (var i=0; i<1000; i++)
        {
            x = Math.random()*(Max_x-Min_x)+Min_x;
            y = Math.random()*(Max_y-Min_y)+Min_y;
            addressPoints.push([y, x, Math.random()*10]);
        }
        */


        $.ajaxSettings.async = false; 
        $.getJSON('data/goldwindEarth_temp2.json',function(json){

            var i=0;
            for(var k in json.data) {
                var strs = [];
                strs=k.split("_");
                addressPoints.push([strs[1], strs[0], (parseInt(json.data[k])-273+50)/100]);


                
                i++;
                if (i>10000000){
                    break;
                }
            }
            console.log("i: "+ i);

        });
        //data/goldwindEarth_temp.json
        //http://54.222.192.208:64003/goldwindEarth?file=2016111600_180-temp-height-80m-gfs-0.50.json



    }

    
    heat.setLatLngs(addressPoints);

    //redraw
    window.setTimeout('layer.render()', 1000);
}
