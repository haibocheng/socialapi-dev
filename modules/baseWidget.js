"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const EXPORTED_SYMBOLS = ["baseWidget"];

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function baseWidget(aWindow) {
  this.create(aWindow);

  Services.obs.addObserver(this, 'social-service-init-ready', false);
  Services.obs.addObserver(this, 'social-service-changed', false);
  Services.obs.addObserver(this, 'social-browsing-enabled', false);
  Services.obs.addObserver(this, 'social-browsing-disabled', false);

  let registry = Cc["@mozilla.org/socialProviderRegistry;1"]
                          .getService(Ci.mozISocialRegistry);
  let service = registry.currentProvider;
  if (service) {
    this.enable();
    this.setProvider(service);
  }
}
baseWidget.prototype = {
  create: function(aWindow) {},
  observe: function(aSubject, aTopic, aData) {
    let registry = Cc["@mozilla.org/socialProviderRegistry;1"]
                            .getService(Ci.mozISocialRegistry);
    if (aTopic == 'social-service-changed') {
      if (registry.currentProvider)
        this.enable();
      this.setProvider(registry.currentProvider);
    }
    else if (aTopic == 'social-service-init-ready') {
      let service = registry.get(aData);
      if (service == registry.currentProvider) {
        this.enable();
        this.setProvider(service);
      }
    }
    else if (aTopic == 'social-browsing-enabled') {
      this.enable();
    }
    else if (aTopic == 'social-browsing-disabled') {
      this.disable();
    }
  },
  setProvider: function(aProvider) {},
  enable: function(aIconURL, aTooltiptext) {},
  disable: function() {},
  show: function() {},
  hide: function() {},
  remove: function() {
    this._widget.parentNode.removeChild(this._widget);
  }
}
