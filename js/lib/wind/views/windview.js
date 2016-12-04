var MeteoblueView = Backbone.View.extend({
    el: "#***container",

    initialize: function(){
        this.render({search_label: "wait to write for wind"});
    },
    render: function(context) {
        //使用underscore这个库，来编译模板
        var template = _.template($("#***_template").html());
        //加载模板到对应的el属性中
        $(this.el).html(template(context));
    },

    events:{ 
        'click ' : 'doSearch'

    },

    doSearch: function(event){
        alert("test");
    }

});