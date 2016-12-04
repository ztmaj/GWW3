
var MeteoblueModel = Backbone.Model.extend({  
    // Default attributes.
    defaults: function() {
      return {
        lat: 35,
        lng: 120,
        prefix: "https://www.meteoblue.com/en/weather/widget/daily/",
        suffix: "_Asia%2FShanghai?geoloc=fixed&days=4&tempunit=CELSIUS&windunit=KILOMETER_PER_HOUR&coloured=coloured&pictoicon=1&maxtemperature=1&mintemperature=1&windspeed=1&winddirection=1&precipitation=1&precipitationprobability=1&spot=1&layout=light",    
        index: "35N120E8"
      };
    },

    initialize: function(){
        //初始化时绑定监听
        this.on("change", function(){
            var index = "";
            var lat = this.get("lat");
            var lng = this.get("lng");

            if (lat>=0){
                index = index + lat + "N";
            }
            else{
                index = index + (-lat) + "S";
            }

            if (lng>=0){
                index = index + lng + "E";
            }
            else{
                index = index + (-lng) + "W";
            }
            this.set({"index":index});
        });
    },

    validate:function(attrs){  
        for(var key in attrs){  
            if(attrs[key] == ''){  
                return key + "won't be null";  
            }
        }  
    }
});

var HisDataModel = Backbone.Model.extend({  
    // Default attributes.
    defaults: function() {
      return {
        lat: 35,
        lng: 120,
        option: {
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
                data: [3, 5, 2, 9]
            }, {
                name: '温度',
                type: 'bar',
                data: [2, 7, 5, 6]
            }]
        }
      };
    },

    initialize: function(){
        //初始化时绑定监听
        this.on("change", function(){
            /**
            this.set({"option":
            {
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
            }}); */
        });
    },

    validate:function(attrs){  
        for(var key in attrs){  
            if(attrs[key] == ''){  
                return key + "won't be null";  
            }
        }  
    }
});



var RadarChartModel = Backbone.Model.extend({  
    // Default attributes.
    defaults: function() {
      return {
        lat: 35,
        lng: 120,
        option: {
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
                        /** 
                        value : [(Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2)],*/
                        value : [50.25, 60.75, 20.52, 60.55, 12.21, 80.22],
                        name : '风场平均'
                    },
                    {
                        /** 
                        value : [(Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2), 
                                (Math.random()*100).toFixed(2)],*/
                        value : [40.25, 70.75, 25.52, 90.55, 42.21, 30.22],
                        name : '该点数据'
                    }
                ]
            }]
        }
        
      };
    },

    initialize: function(){
        //初始化时绑定监听
        this.on("change", function(){

        });
    },

    validate:function(attrs){  
        for(var key in attrs){  
            if(attrs[key] == ''){  
                return key + "won't be null";  
            }
        }  
    }
});


var SettingsModel = Backbone.Model.extend({  
    // Default attributes.
    defaults: function() {
      return {
        //wind
        density: 1100,
        densityMin: 50,
        densityMax: 1500,
        densityStep: 1,
        frameRate: 350,
        frameRateMin: 50,
        frameRateMax: 800,
        frameRateStep: 10,
        thickness: 0.5,
        thicknessMin: 0.1,
        thicknessMax: 1,
        thicknessStep: 0.1,
        length: 40,
        lengthMin: 20,
        lengthMax: 60,
        lengthStep: 1,
        backgroundopacity: 1,
        backgroundopacityMin: 0,
        backgroundopacityMax: 1,
        backgroundopacityStep: 0.1,

        //overlay
        index: "35N120E8"
      };
    },

    initialize: function(){
        //初始化时绑定监听
        this.on("change", function(){

        });
    },

    validate:function(attrs){  
        for(var key in attrs){  
            if(attrs[key] == ''){  
                return key + "won't be null";  
            }
        }  
    }
});
