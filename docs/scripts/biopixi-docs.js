(function () {
  function selectTab(group, tab) {
    var tabs = Array.from(group.querySelectorAll('[role="tab"]'));

    tabs.forEach(function (candidate) {
      var selected = candidate === tab;
      var panel = document.getElementById(candidate.getAttribute("aria-controls"));

      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;

      if (panel) {
        panel.classList.toggle("is-active", selected);
        panel.hidden = !selected;
      }
    });
  }

  document.addEventListener("click", function (event) {
    var tab = event.target.closest('[data-agent-tabs] [role="tab"]');

    if (tab) {
      selectTab(tab.closest("[data-agent-tabs]"), tab);
    }
  });

  document.addEventListener("keydown", function (event) {
    var tab = event.target.closest('[data-agent-tabs] [role="tab"]');

    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    var group = tab.closest("[data-agent-tabs]");
    var tabs = Array.from(group.querySelectorAll('[role="tab"]'));
    var index = tabs.indexOf(tab);
    var nextIndex;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      var direction = event.key === "ArrowRight" ? 1 : -1;
      nextIndex = (index + direction + tabs.length) % tabs.length;
    }

    event.preventDefault();
    selectTab(group, tabs[nextIndex]);
    tabs[nextIndex].focus();
  });
})();
