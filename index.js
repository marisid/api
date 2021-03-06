
var visualiser = (function() {

  // DOM Elements
  var sourceDropDown = document.getElementById('source-dropdown'),
    analyzeBtn = document.getElementById('analyze'),
    sourceLogo = document.getElementById('source-logo'),
    headLines = document.getElementById('headlines'),
    infoGraphicContainer = document.getElementById('infographic-container'),
    pageTitle = document.getElementById('page-title');

  // Global database
  var database = {};

  // Media query
  var isMobileScreen = window.matchMedia('(max-width: 600px)');

  // Waterfall function
  var waterfall = this.waterfall = function (arg, tasks, cb) {
    var next = tasks[0];
    var tail = tasks.slice(1);
    if (typeof next !== 'undefined') {
      next(arg, function(err, result) {
        if(err) { return cb(err); }
        waterfall(result, tail, cb);
      });
      return;
    }
    cb(null, arg);
  }

  // Make values of each topic be between 0 and 1.0
  var normalise = this.normalise = function(topics, cb) {
    var maxValue = 1;
    for(var topic in topics) {
      if(topics[topic] > maxValue) {
        maxValue = topics[topic];
      }
    }
    for(var topic in topics) {
      topics[topic] = topics[topic] / maxValue;
    }
    cb(null, topics);
  }

  //// Event Handlers /////

  // Window load
  window.addEventListener('load', function(){
    waterfall(database, [getSources, buildOptions, updateLogo, getHeadlines, updateArticles,analyzeButtonReady], function(err, res){
    });
  });

  // Dropdown
  sourceDropDown.addEventListener('change', function(){
    waterfall(sourceDropDown.value, [analyzeButtonLoading, updateLogo, getHeadlines, updateArticles, analyzeButtonReady], function(err, res) {
      if(err) { throw new Error(err); }
      addToggleToHeadlines();
      analyzeBtn.disabled = false;
    });
  });

  // Analyze
  analyzeBtn.addEventListener('click', function(){
    if(infographicVisible()) {
      toggleInfographic();
    } else {
      waterfall(sourceDropDown.value, [analyzeButtonLoading, getHeadlines, processHeadlines, normalise, analyzeButtonReady], function(err, res) {
        if(err) { throw new Error(err); }
        buildInfoGraph(res);
        toggleInfographic();
      });
    }
  });

  //// Waterfall end functions ////

  // Analyze load/ready state functions
  var analyzeButtonLoading = this.analyzeButtonLoading = function(arg, cb){
    analyzeBtn.textContent="Loading";
    analyzeBtn.disabled = true;
    cb(null, arg);
  }

  var analyzeButtonReady = this.analyzeButtonReady = function(arg, cb){
    analyzeBtn.textContent="Analyze";
    analyzeBtn.disabled = false;
    cb(null, arg);
  }

  // function to build options for sourceDropDown select elements
  var buildOptions = this.buildOptions = function(database, cb){
    for (var source in database){
      var option = document.createElement('option');
      option.textContent = source;
      option.value = source;
      sourceDropDown.appendChild(option);
    }
    cb(null, sourceDropDown.value);
  }

  // Add onClick functionality when headlines loaded
  var addToggleToHeadlines = this.addToggleToHeadlines = function() {
    var headlines = document.querySelectorAll('.headline');
    for(var i = 0; i < headlines.length; i++) {
      headlines[i].addEventListener('click', function(event) {
        if(isMobileScreen.matches && event.target.tagName !== 'A') {
          var details = this.querySelector('.headline__details');
          details.style.display = details.style.display === 'block' ? 'none' : 'block';
        }
      });
    }
  }

  //// Async functions ////

  // 1. getSources called on window load
  function getSources(database, cb){
    var url = 'https://newsapi.org/v1/sources?language=en&country=gb' + '&apikey=' + apiKeys.newsApiKey;
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', function(){
      var json = JSON.parse(xhr.responseText);
      json.sources.forEach(function(source) {
        buildDatabase(source);
      });
      cb(null, database);
    });
    xhr.open('GET', url, true);
    xhr.send();
  }

  // Helper function for getSources

  function buildDatabase(source) {
    database[source.name] = {
      name: source.name,
      id: source.id,
      logo: source.urlsToLogos.small
    };
  }

  // 2. getHeadlines, accepts db object name and retrieves headlines
  function getHeadlines(source, cb) {
    var selectedSource = database[source];

    var url = 'https://newsapi.org/v1/articles?' + 'source=' + selectedSource.id + '&apikey=' + apiKeys.newsApiKey;
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', function(){
      // This will store all headlines to db
      var json = JSON.parse(xhr.responseText);
      database[selectedSource.name]['headlines'] = [];
      json.articles.forEach(function(article) {
        delete article['author'];
        database[selectedSource.name]['headlines'].push(article);
      });
      cb(null, selectedSource);
    });
    xhr.open('GET', url, true);
    xhr.send();
  }

  var updateLogo = this.updateLogo = function (selectedSource, cb){
    var logoUrl = database[selectedSource]['logo'];
    sourceLogo.src = logoUrl;
    sourceLogo.alt = database[selectedSource]["name"] + ' logo';
    cb(null, selectedSource);
  }

  var updateArticles = this.updateArticles = function(selectedSource, cb) {
    headLines.innerHTML = '';
    selectedSource['headlines'].forEach(function(headline) {
      // creating new elements
      var article = document.createElement('article');
          article.classList.add('headline');
      var image = document.createElement('img');
          image.classList.add('headline__image');
          // Default to source logo when headline logo is not available
          if(headline["urlToImage"]) {
            image.src = headline["urlToImage"];
            image.alt = headline['title'] + ' - article image';
          }
          else {
            image.src = selectedSource["logo"];
            image.alt = selectedSource["name"] + ' logo';
          }
      var heading = document.createElement('h1');
          heading.classList.add('headline__title');
          heading.textContent = headline.title;
      var details = document.createElement('div');
          details.classList.add('headline__details');
      var description = document.createElement('p');
          description.classList.add('headline__details__description');
          description.textContent = headline.description;
      var link = document.createElement('a');
          link.classList.add('headline__details__link');
          link.href = headline.url;
          link.textContent = 'See more...';

      details.appendChild(description);
      details.appendChild(link);
      // populating new elements
      article.appendChild(image);
      article.appendChild(heading);
      article.appendChild(details);
      // Append to headlines
      headLines.appendChild(article);
    });
    cb(null, selectedSource);
  }

  var processHeadlines = this.processHeadlines = function(selectedSource, cb){
    var headlines = selectedSource.headlines;
    var topics = {};
    /* Waterfall expects an array of functions, so this prepares one for each headline to be analysed.
     * .bind is used to give each function an argument 'headline' so it knows which one to analyse.
     */
    var headlineHandlers = headlines.map(function(headline) {
      return analyseHeadline.bind(null, headline);
    });
    waterfall(topics, headlineHandlers, function(err, res) {
      cb(null, res);
    });
  }

  // Text Razor requests
  var analyseHeadline = this.analyseHeadline = function(headline, topics, cb) {
    var http = new XMLHttpRequest();
    var url = 'https://api.textrazor.com/';
    var params = 'text=' + headline.title + '&extractors=topics';

    http.open('POST', url, true);
    http.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
    http.setRequestHeader('X-TextRazor-Key', apiKeys.textRazorKey);

    http.addEventListener('load', function() {
      var json = JSON.parse(http.responseText);
      if(json.response.coarseTopics) {
        updateTopics(json, topics);
      }
      cb(null, topics);
    });

    http.send(params);

  }

  var updateTopics = this.updateTopics = function(json, topics) {
    json.response.coarseTopics.forEach(function(el){
      if(el.score > 0.5) {
        if(topics[el.label]) {
          topics[el.label] += el.score;
        } else {
          topics[el.label] = el.score;
        }
      }
    });
  }

  /* Infographic builder */
  var buildInfoGraph = this.buildInfoGraph = function(data){

    if (infoGraphicContainer.children){
      infoGraphicContainer.innerHTML = '';
    }
    /* BEM */
    var blockClass = 'graph',
        elementClass = blockClass + '__item',
        modifierClass = [
          '--color1',
          '--color2',
          '--color3',
          '--color4',
          '--color5',
          '--color6',
          '--color7',
          '--color8',
          '--color9',
          '--color10',
        ];

    /* Create ul */
    var ul = document.createElement('ul');
        ul.classList.add(blockClass);

    var colorIndex = 0;
    /* for each data piece */
    for (var prop in data) {

      /* Create element */
      var li = document.createElement('li');
          li.textContent = prop;

      /* convert 0-1 float val to percent */
      var percent = (data[prop] * 100).toFixed(0) + '%';

      li.style.width = percent;
      li.setAttribute('percent', percent);

      /* assign random color modifier */
      var randomColor = modifierClass[colorIndex];
      colorIndex++;

      li.classList.add(elementClass);
      li.classList.add(elementClass + randomColor);

      /* add li to ul */
      ul.appendChild(li);
    }

    /* add to infoGraphicContainer */
    infoGraphicContainer.appendChild(ul);
  }

  /* toggle infographic */
  var toggleInfographic = this.toggleInfographic = function(){
    if (!infographicVisible()) {
      infoGraphicContainer.classList.remove('infographic-container--hidden');
      pageTitle.textContent = sourceDropDown.value;
      analyzeBtn.textContent = 'Back';
    } else {
      infoGraphicContainer.classList.add('infographic-container--hidden');
      pageTitle.textContent = 'Visualiser News';
      analyzeBtn.textContent = 'Analyze';
    }
  }

  var infographicVisible = this.infographicVisible = function() {
    return !infoGraphicContainer.classList.contains('infographic-container--hidden');
  }

})();
