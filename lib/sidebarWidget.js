"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://socialdev/lib/console.js");
Cu.import("resource://socialdev/lib/listen.js");
Cu.import("resource://socialdev/lib/unload+.js");
Cu.import("resource://socialdev/lib/watchWindows.js");
Cu.import("resource://socialdev/lib/registry.js");

const EXPORTED_SYMBOLS = ["Sidebar"];

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const isMac = Services.appinfo.OS == "Darwin";


function Sidebar(aWindow) {
  this.create(aWindow);

  Services.obs.addObserver(this, 'social-service-init-ready', false);
  Services.obs.addObserver(this, 'social-service-changed', false);
  Services.obs.addObserver(this, 'social-service-deactivated', false);

  let self = this;
  unload(function() {
    self.remove();
  }, aWindow);
  
  let service = providerRegistry().currentProvider;
  if (service) {
    this.setProvider(service);
  }
}
Sidebar.prototype = {
  create: function(aWindow) {
    let self = this;
    let {document, gBrowser} = aWindow;
  
    // We insert a vbox as a child of 'browser', as an immediate sibling of 'appcontent'
    let vbox = this._widget = document.createElementNS(XUL_NS, "vbox");
    vbox.setAttribute("id", "social-vbox");
    vbox.setAttribute("width", "240");
    vbox.style.overflow = "hidden";
  
    let cropper = document.createElementNS(XUL_NS, "vbox");
    cropper.setAttribute("id", "social-cropper");
    cropper.style.overflow = "hidden";
    vbox.appendChild(cropper);
  
    // Create the sidebar browser
    var sbrowser = document.createElementNS(XUL_NS, "browser");
    sbrowser.setAttribute("id", "social-status-sidebar-browser");
    sbrowser.setAttribute("type", "content");
    sbrowser.setAttribute("flex", "1");
    sbrowser.style.overflow = "hidden";
  
    // start with the sidebar closed.
    sbrowser._open = false;
  
    let after = document.getElementById('appcontent');
    let splitter = document.createElementNS(XUL_NS, "splitter");
    splitter.setAttribute("id", "social-splitter");
    splitter.className = "chromeclass-extrachrome";
  
    // XXX FIX THIS LATER, os-specific css files should be loaded
    splitter.style.mozBorderStart = "none";
    splitter.style.mozBorderEnd = "1px solid #404040";
    splitter.style.minWidth = "1px";
    splitter.style.width = "1px";
    splitter.style.backgroundImage = "none !important";
  
    // Resize the sidebar when the user drags the splitter
    splitter.addEventListener("mousemove", function() {
      self.reflow();
    });
    splitter.addEventListener("mouseup", function() {
      self.reflow();
    });
  
    document.getElementById('browser').insertBefore(vbox, after.nextSibling);
    document.getElementById('browser').insertBefore(splitter, after.nextSibling);
  
    cropper.appendChild(sbrowser);
  
    // Make sure the browser stretches and shrinks to fit
    listen(aWindow, aWindow, "resize", function({target}) {
      if (target == aWindow) {
        self.reflow();
      }
    });
  
    // Show full on over, minimize on out
    // Toggle sidebar position states on right-click
    let tabs = document.getElementById("TabsToolbar");
    let nav = document.getElementById("nav-bar");
  
  
    // XXX hardcode reflowing for the single sbrowser on initial load for now
    sbrowser.addEventListener("DOMContentLoaded", function onLoad() {
      sbrowser.removeEventListener("DOMContentLoaded", onLoad);
      self.reflow();
    });
  
    this.attacheContextMenu();
    // Automatically open (and keep open) the sidebar if minimized when clicked
    vbox.addEventListener("click", function(event) {
      // ack - this is wrong - ideally we want "command" but it doesn't work.
      // check the button so a right-click doesn't do this *and* show the popup
      if (event.button != 0) {
        return;
      }
      if (sbrowser.visibility != "open") {
        sbrowser.visibility = "open";
      }
    });
  
    Object.defineProperty(sbrowser, "visibility", {
      get: function() {
        if (vbox.getAttribute("hidden") == "true") {
          return "hidden";
        }
        return sbrowser._open ? "open" : "minimized";
      },
      set: function(newVal) {
        let hiddenVal;
        switch (newVal) {
          case "open":
            hiddenVal = false;
            sbrowser._open = true;
            break;
          case "minimized":
            hiddenVal = false;
            sbrowser._open = false;
            break;
          case "hidden":
            hiddenVal = true;
            break;
          default:
            throw "invalid visibility state";
        }
        vbox.setAttribute("hidden", hiddenVal);
        splitter.setAttribute("hidden", hiddenVal);
        self.reflow();
      }
    });
  },
  attacheContextMenu: function() {
    let {document, gBrowser} = this._widget.ownerDocument.defaultView;
    let vbox = this._widget;
    // create a popup menu for the browser.
    // XXX - can we consolidate the context menu with toolbar items etc
    // in a commandset?
    let popupSet = document.getElementById("mainPopupSet");
    let menu = document.createElement("menupopup");
    menu.id = "social-context-menu";
    menu.addEventListener("popupshowing", function(event) {
      let service = providerRegistry().currentProvider;
      if (!service || !service.active) {
        event.preventDefault();
        return ;
      }
      let menuitem = document.createElement( "menuitem" );
      menuitem.setAttribute("label", "Turn off " + service.name);
      menuitem.addEventListener("command", function() {
        service.deactivate();
      });
      menu.appendChild(menuitem);
      // and a "refresh" menu item.
      menuitem = document.createElement( "menuitem" );
      menuitem.setAttribute("label", "Refresh");
      menuitem.addEventListener("command", function() {
        let sbrowser = document.getElementById("social-status-sidebar-browser");
        sbrowser.contentWindow.location = service.sidebarURL;
      });
      menu.appendChild(menuitem);
    }, false);
    menu.addEventListener("popuphidden", function() {
      let elts = menu.getElementsByTagName("menuitem");
      while (elts.length) {
        menu.removeChild(elts[0]);
      }
    }, false);
    popupSet.appendChild(menu);
    vbox.setAttribute("context", "social-context-menu");    
  },
  reflow: function() {
    let window = this._widget.ownerDocument.defaultView;
    let sbrowser = window.document.getElementById('social-status-sidebar-browser');
    let nav = window.document.getElementById('nav-bar');
    let visibility = sbrowser.visibility;
    if (visibility == "hidden") {
      // just reset the navbar stuff.
      nav.style.paddingRight = "";
      // anything else?
      return;
    }
    let open = visibility == "open";
  
    if (open)
      window.document.documentElement.classList.add("social-open");
    else
      window.document.documentElement.classList.remove("social-open");
  
    let tabs = window.document.getElementById("TabsToolbar");
    let vbox = window.document.getElementById('social-vbox');
    let cropper = window.document.getElementById('social-cropper');
  
    // Include the visual border thickness when calculating navbar height
    let navHeight = nav.clientHeight + (isMac ? 2 : 1);
    let openHeight = window.gBrowser.boxObject.height + navHeight;
    let sideWidth = vbox.getAttribute("width");
  
    let targetWindow = sbrowser.contentWindow.wrappedJSObject;
    tabs.style.paddingRight = "";
    nav.style.paddingRight = sideWidth + "px";
    cropper.style.height = (open ? openHeight : navHeight) + "px";
    vbox.style.marginLeft = open ? "" : "-" + sideWidth + "px";
    vbox.style.marginTop =  "-" + navHeight + "px";
    sbrowser.style.height = openHeight + "px";
  
    // TODO XXX Need an API to inform the content page how big to make the header
    var header = targetWindow.document.getElementById("header");
    if (header) {
      var headerStyle = targetWindow.document.getElementById("header").style;
      headerStyle.height = navHeight - 1 + "px";
      headerStyle.overflow = "hidden";
    }
  },
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == 'social-service-changed') {
      this.setProvider(providerRegistry().currentProvider);
    }
    else if (aTopic == 'social-service-init-ready') {
      let registry = providerRegistry();
      let service = registry.getNamed(aData);
      if (service == registry.currentProvider) {
        this.setProvider(service);
      }
    }
    else if (aTopic == 'social-service-deactivated') {
      let registry = providerRegistry();
      let service = registry.getNamed(aData);
      if (service == registry.currentProvider) {
        this.disable();
      }
    }
  },
  setProvider: function(aService) {
    let self = this;
    let window = this._widget.ownerDocument.defaultView;

    dump("setVisibleService " + aService.name + "\n");
  
    if (!aService.active) return;// sanity check
  
    // retarget the sidebar
    var sbrowser = window.document.getElementById("social-status-sidebar-browser");
    sbrowser.service = aService;
    sbrowser.contentWindow.location = aService.sidebarURL;
    sbrowser.visibility = sbrowser._open ? "open" : "minimized";
  
    // set up a locationwatcher
    try {
      // Keep a reference to the listener so it doesn't get collected
      sbrowser.removeProgressListener(sbrowser.watcher);
      sbrowser.watcher = new LocationWatcher(sbrowser.service.URLPrefix, sbrowser);
      sbrowser.addProgressListener(sbrowser.watcher, Ci.nsIWebProgress.NOTIFY_LOCATION);
    } catch (e) {
      Cu.reportError(e);
    }
  },
  enable: function() {
  },
  disable: function() {
    let window = this._widget.ownerDocument.defaultView;
    let sbrowser = window.document.getElementById("social-status-sidebar-browser");
    // this sidebar is displaying this service;
    // turn everything off.
    try {
      sbrowser.removeProgressListener(sbrowser.watcher);
    } catch(e) {
      Cu.reportError(e);
    }
    sbrowser.watcher = null;
    sbrowser.contentWindow.location = "about:blank";
    sbrowser.visibility = "hidden";
    this.reflow();
  },
  remove: function() {
    var restoreToolbar= function() {
      let tabs = aWindow.document.getElementById("TabsToolbar");
      tabs.style.paddingRight = "";
      var navBar = aWindow.document.getElementById('nav-bar');
      navBar.style.paddingRight = "";
    }

    this._widget.parentNode.removeChild(this._widget.previousSibling); // remove splitter
    this._widget.parentNode.removeChild(this._widget);
    restoreToolbar();
  }
}


function LocationWatcher(prefix, browser) {
  this._prefix = prefix;
  this._browser = browser;
  return this;
}

LocationWatcher.prototype = {
  QueryInterface: function(aIID) {
    if (aIID.equals(Ci.nsIWebProgressListener)   ||
        aIID.equals(Ci.nsIWebProgressListener2)  ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_NOINTERFACE;
  },
  onStateChange: function(/*in nsIWebProgress*/ aWebProgress,
                     /*in nsIRequest*/ aRequest,
                     /*in unsigned long*/ aStateFlags,
                     /*in nsresult*/ aStatus)
  {
  },

  onProgressChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in long*/ aCurSelfProgress,
                        /*in long */aMaxSelfProgress,
                        /*in long */aCurTotalProgress,
                        /*in long */aMaxTotalProgress)
  {
  },

  onLocationChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in nsIURI*/ aLocation)
  {
    if (aLocation.spec.indexOf(this._prefix) != 0) {

      try {
        let parentWin = Services.wm.getMostRecentWindow("navigator:browser");
        let newTab = parentWin.gBrowser.addTab(aLocation.spec);
        parentWin.gBrowser.selectedTab = newTab;
      } catch (e) {
        console.log(e);
      }

      try {
        this._browser.goBack();
      } catch (e) {
        console.log(e);
      }
    }
  },

  onStatusChange: function(/*in nsIWebProgress*/ aWebProgress,
                      /*in nsIRequest*/ aRequest,
                      /*in nsresult*/ aStatus,
                      /*in wstring*/ aMessage)
  {
  },

  onSecurityChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in unsigned long*/ aState)
  {
  },
}