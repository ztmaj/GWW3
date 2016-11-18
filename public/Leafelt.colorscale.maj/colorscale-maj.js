L.Control.ColorScale = L.Control.extend({
    options: {
        position: 'bottomright' //初始位置

    },
    initialize: function (options) {
        L.Util.extend(this.options, options);

    },
    onAdd: function (map) {
       //创建一个class为leaflet-control-ccolor的div
        this._container = L.DomUtil.create('div', 'leaflet-control-ccolor leaflet-bar leaflet-control');

          

            return this._container;
        },

        /*
        _onCloseControl: function () {
            this.removeFrom(this._map);
        },*/
});