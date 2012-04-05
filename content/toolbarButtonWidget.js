"use strict";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://socialdev/modules/baseWidget.js");


function SocialToolbarButton() {
  baseWidget.call(this, window);

  // we need to make our button appear on first install, for now we always
  // ensure that it is in the toolbar, even if the user removes it
  var navbar = window.document.getElementById("nav-bar");
  var newset = navbar.currentSet + ",social-button-container";
  navbar.currentSet = newset;
  navbar.setAttribute("currentset", newset );
  window.document.persist("nav-bar", "currentset");

  // XXX i think we can use broadcasters for this state
  let sidebar = window.social.sidebar;
  let str = document.getElementById("socialdev-strings");
  let label = (sidebar.visibility == "hidden" ? "browserEnable.label" : "browserDisable.label")
  document.getElementById('social-socialbrowsing-menu').
    setAttribute('label', str.getString(label));
  label = (sidebar.visibility == "open" ? "minimizeSidebar.label" : "showSidebar.label")
  document.getElementById('social-socialtoolbar-menu').
    setAttribute('label', str.getString(label));
}
SocialToolbarButton.prototype = {
  __proto__: baseWidget.prototype,
  create: function(aWindow) {
  },
  remove: function() {
  },
  enable: function() {
    dump("SHOW the toolbarbutton now\n");
    document.getElementById("social-button-container").removeAttribute('hidden');
  },
  disable: function() {
    dump("HIDE the toolbarbutton now\n");
    document.getElementById("social-button-container").setAttribute('hidden', true);
  },
  onpopupshown: function(event) {
    let aWindow = event.target.ownerDocument.defaultView;
    var sbrowser = aWindow.document.getElementById("social-status-sidebar-browser");
    sbrowser.style.opacity = 0.3;
  },
  onpopuphidden: function(event) {
    let aWindow = event.target.ownerDocument.defaultView;
    var sbrowser = aWindow.document.getElementById("social-status-sidebar-browser");
    sbrowser.style.opacity = 1;
  },
  onpopupshowing: function(event) {
    let aWindow = event.target.ownerDocument.defaultView;
    let socialpanel = aWindow.document.getElementById("social-toolbar-menu");
    buildSocialPopupContents(aWindow, socialpanel);
  },
  onToggleEnabled: function() {
    var str = document.getElementById("socialdev-strings");
    if (window.social.sidebar.visibility != "hidden") {
      Services.obs.notifyObservers(null, "social-browsing-disabled", null);
      document.getElementById('social-socialbrowsing-menu').
        setAttribute('label', str.getString("browserEnable.label"));
    }
    else {
      Services.obs.notifyObservers(null, "social-browsing-enabled", null);
      document.getElementById('social-socialbrowsing-menu').
        setAttribute('label', str.getString("browserDisable.label"));
    }
  },
  onToggleVisible: function() {
    var str = document.getElementById("socialdev-strings");
    let registry = Cc["@mozilla.org/socialProviderRegistry;1"]
                            .getService(Ci.mozISocialRegistry);
    if (!registry.currentProvider || !registry.currentProvider.enabled) {
      Services.console.logStringMessage("no service is enabled, so not opening the socialbar!")
    }
    else {
      let sidebar = window.social.sidebar;
      if (sidebar.visibility == 'hidden') {
        Services.obs.notifyObservers(null, "social-browsing-enabled", null);
        document.getElementById('social-socialbrowsing-menu').
          setAttribute('label', str.getString("browserDisable.label"));
      }
      else {
        sidebar.visibility = (sidebar.visibility=="open" ? "minimized" : "open");
        let label = (sidebar.visibility == "open" ? "minimizeSidebar.label" : "showSidebar.label")
        document.getElementById('social-socialtoolbar-menu').
          setAttribute('label', str.getString(label));
      }
    }
  },
  
  fireDemoNotification: function(event) {
    // cannot fire a notification from inside an event, setTimeout is our friend
    let notification = {};
    Cu.import("resource://socialdev/modules/notification.js", notification);
    window.setTimeout(notification.addNotification, 0, {
        "_iconUrl": "http://1.gravatar.com/userimage/13041757/99cac03c3909baf0cd2f2a5e1cf1deed?size=36",
        "_title": "Michael Hanson",
        "_body" : "has demoed a Firefox feature"
      });
  }
}


const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function buildSocialPopupContents(window, socialpanel)
{
  let registry = Cc["@mozilla.org/socialProviderRegistry;1"]
                          .getService(Ci.mozISocialRegistry);

  function renderNotificationRow(img, title, text) {
    let row = window.document.createElementNS(HTML_NS, "div");
    row.setAttribute("style", "clear:all;cursor:pointer;margin-left:8px;height:32px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:-moz-system-font;border-right:");
    
    let imgElem = window.document.createElementNS(HTML_NS, "img");
    imgElem.setAttribute("src", img);
    imgElem.setAttribute("style", "width:28px;height:28px;margin-right:8px;float:left");

    let titleElem = window.document.createElementNS(HTML_NS, "span");
    titleElem.appendChild(window.document.createTextNode(title));
    titleElem.setAttribute("style", "font-weight:bold");

    let textElem = window.document.createElementNS(HTML_NS, "span");
    textElem.appendChild(window.document.createTextNode(((text.length > 0 && text[0] != ' ') ? " " : "")+ text));

    row.appendChild(imgElem);
    row.appendChild(titleElem);
    row.appendChild(textElem);
    return row;
  }

  function renderProviderMenuitem(service, container, before) {

    let menuitem = window.document.createElementNS(XUL_NS, "menuitem");
    menuitem.setAttribute("label", service.name);
    menuitem.setAttribute("class", "menuitem-iconic");
    menuitem.setAttribute("image", service.iconURL);
    menuitem.setAttribute("type", "radio");
    menuitem.setAttribute("name", "socialprovider");
    if (service == registry.currentProvider) {
      // no need for a click handler if we're selected
      menuitem.setAttribute("checked", true);
    }
    else {
      menuitem.addEventListener("click", function(event) {
        registry.currentProvider = service;
      });
    }
    container.insertBefore(menuitem, before);

    // render notifications...
    for (let i in service.notifications) {
      let aNotif = service.notifications[i];
      container.appendChild(renderNotificationRow(aNotif[0], aNotif[1], aNotif[2]));
    }
  }

  let menuitem;
  let disabled = window.social.sidebar.disabled;
  try {
    let providerSep = document.getElementById('social-providers-separator');
    let fc = providerSep.previousSibling;
    while (fc.localName != 'menuseparator') {
      socialpanel.removeChild(fc);
      fc = providerSep.previousSibling;
    }
    // Create top-level items
    if (!disabled && registry.currentProvider) {
      // Create network rows...
      registry.each(function(service) {
        if (service.enabled)
          renderProviderMenuitem(service, socialpanel, providerSep);
      });
    }

  }
  catch (e) {
    Cu.reportError("Error creating socialpopupcontents: " + e);
  }
}
