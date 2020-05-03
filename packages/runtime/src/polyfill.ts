// NOTE(Jae): 2020-04-26
// See comment in runtime.ts for why this file is NOT currently
// imported.

// IE11 does not support endsWith, so we polyfill it
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(searchString, position) {
      var subjectString = this.toString();
      if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
        position = subjectString.length;
      }
      position -= searchString.length;
      var lastIndex = subjectString.indexOf(searchString, position);
      return lastIndex !== -1 && lastIndex === position;
  };
}

// TODO(Jae): 2020-04-26
// Perhaps get a Promise polyfill for IE11 support
