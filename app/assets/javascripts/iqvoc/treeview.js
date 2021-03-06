/*jslint vars: true, browser: true, white: true */
/*global jQuery, IQVOC */

IQVOC.treeview = (function($) {

"use strict";

function Treeview(container) {
  this.container = container.jquery ? container : $(container);

  $(container).each(function() {
    var url = $(this).data('url');
    var container = this;

    var dragabbleSupport = $(container).data('dragabble');
    var polyhierarchySupport = $(container).data('polyhierarchy-support');
    var saveLabel = $(container).data('save-label');
    var copyLabel = $(container).data('copy-label');
    var undoLabel = $(container).data('undo-label');

    // build tree data from html markup
    var data = $(this).children('li').map(function() {
      var item = $(this);

      return {
        label: item.children('a').html(),
        load_on_demand: item.data('has-children'),
        locked: item.data('locked'),
        id: item.attr('id'),
        url: item.children('a').attr('href'),
        update_url: item.data('update-url'),
        glance_url: item.data('glance-url'),
        published: item.data('published'),
        additionalText: item.children('span.additional_info')
      };
    });

    $(this).tree({
      dragAndDrop: dragabbleSupport ? true : false,
      autoEscape: false,
      selectable: false,
      useContextMenu: false,
      closedIcon: $('<i class="fa fa-plus-square-o"></i>'),
      openedIcon: $('<i class="fa fa-minus-square-o"></i>'),
      data: data,
      dataUrl: function(node) {
        var uri = URI(url).addQuery('root', node.id);
        return uri.normalize().toString();
      },
      onCreateLi: function(node, $li) {
        var link = buildLink(node.url, node.name, node.additionalText);
        $li.find('.jqtree-title').replaceWith(link);

        // mark published/unpublished items
        if (typeof node.published !== 'undefined' && !node.published) {
          // modify draft link
          var href = URI(link.attr('href'));
          link.attr('href', href.addQuery('published', 0));
          link.addClass('unpublished');
        } else {
          link.addClass('published');
        }

        if (typeof link[0] !== 'undefined') {
          var teaserLink = buildTeaserLink(node, link[0]);
        }

        if (dragabbleSupport) {
          // mark locked items
          if (typeof node.locked !== 'undefined' && node.locked) {
            // add icon only to the first element of the collection.
            // the second one could be a nodelist for parents nodes.
            $(link[0]).after(' <i class="fa fa-lock"/>');
          }

          if (typeof node.locked !== 'undefined' && !node.locked) {
            // add icon only to the first element of the collection.
            // the second one could be a nodelist for parents nodes.
            $(link[0]).after(' <i class="fa fa-arrows"/>');
          }
        }

        if(node.moved) {
          $li.data('node-id', node.id);
          $li.data('old-parent-node-id', node.old_parent_id);
          $li.data('new-parent-node-id', node.target_node_id);
          $li.data('old-previous-sibling-id', node.old_previous_sibling_id);
          $li.data('update-url', node.update_url),
          $li.data('glance-url', node.glance_url);

          var saveButton = $('<button type="button" class="btn btn-primary btn-xs node-btn" data-tree-action="move"><i class="fa fa-save"></i> ' + saveLabel + '</button>');
          var copyButton = $('<button type="button" class="btn btn-primary btn-xs node-btn" data-tree-action="copy"><i class="fa fa-copy"></i> ' + copyLabel + '</button>');
          var undoButton = $('<button type="button" class="btn btn-primary btn-xs reset-node-btn"><i class="fa fa-undo"></i> ' + undoLabel + '</button>');

          // add icon only to the first element of the collection.
          // the second one could be a nodelist for parents nodes.
          $(link[0]).after(saveButton, undoButton);

          if(polyhierarchySupport) {
            saveButton.after(copyButton);
          }
        }
      },
      onIsMoveHandle: function($element) {
        // dom element which acts as move handle
        return ($element.is('.fa-arrows'));
      },
      onCanMoveTo: function(moved_node, target_node, position){
        // prevent node movement inside parent node
        if (moved_node.parent === target_node.parent && position === 'after'){
          return false;
        }
        // prevent locked node movement
        else if (moved_node.locked === true || target_node.locked === true) {
          return false;
        }
        // only drop node inside nodes, no ordering
        else if (position === 'after') {
          return false;
        } else {
          return true;
        }
      }
    });
  });

  // mark moved nodes
  $('ul.hybrid-treeview').on('tree.move', function(event) {
    var moved_node = event.move_info.moved_node;

    $(this).tree('updateNode', moved_node, {
      moved: true,
      target_node_id: event.move_info.target_node.id
    });

    if (moved_node.getPreviousSibling() !== null) {
      $(this).tree('updateNode', moved_node, {old_previous_sibling_id: moved_node.getPreviousSibling().id});
    }
    if (typeof moved_node.parent.id !== 'undefined') {
      $(this).tree('updateNode', moved_node, {old_parent_id: moved_node.parent.id});
    }
  });

  // save/copy moved node
  $('ul.hybrid-treeview').on('click', 'button.node-btn', function(event) {
    var $tree = $('ul.hybrid-treeview');
    var treeAction = $(this).data('tree-action');
    var updateUrl = $(this).closest('li').data('update-url');

    var movedNodeId = $(this).closest('li').data('node-id');
    var oldParentNodeId = $(this).closest('li').data('old-parent-node-id');
    var oldPreviousSiblingId = $(this).closest('li').data('old-previous-sibling-id');
    var newParentNodeId = $(this).closest('li').data('new-parent-node-id');

    $.ajax({
      url : updateUrl,
      type : 'PATCH',
      data : {
        tree_action: treeAction,
        moved_node_id: movedNodeId,
        old_parent_node_id: oldParentNodeId,
        new_parent_node_id: newParentNodeId
      },
      statusCode: {
        200: function() {
          [movedNodeId, newParentNodeId, oldParentNodeId].forEach(function(nodeId){
            setToDraft(nodeId, $tree);
          });

          // add node to old parent, necessary to see both node directly after movement,
          // this is not necessary if you refresh the page
          if (treeAction === 'copy') {
            var node = $tree.tree('getNodeById', movedNodeId);
            if (typeof oldPreviousSiblingId !== 'undefined') {
              var old_previous_sibling = $tree.tree('getNodeById', oldPreviousSiblingId);
              $tree.tree('addNodeAfter', node, old_previous_sibling);
            } else if (typeof oldParentNodeId !== 'undefined') {
              var old_parent_node = $tree.tree('getNodeById', oldParentNodeId);
              $tree.tree('appendNode', node, old_parent_node);
            }
          }
        }
      }
    });
  });

  // reset moved node
  $('ul.hybrid-treeview').on('click', 'button.reset-node-btn', function(event) {
    var $tree = $('ul.hybrid-treeview');
    var nodeId = $(this).closest('li').data('node-id');
    var oldPreviousSiblingId = $(this).closest('li').data('old-previous-sibling-id');
    var oldParentNodeId = $(this).closest('li').data('old-parent-node-id');

    moveToOldPosition(nodeId, oldPreviousSiblingId, oldParentNodeId, $tree);
  });

  function setToDraft(nodeId, $tree) {
    if (typeof nodeId !== 'undefined') {
      var moved_node = $tree.tree('getNodeById', nodeId);
      $tree.tree('updateNode', moved_node, {
        moved: false,
        published: false
      });
    }
  }

  function moveToOldPosition(nodeId, oldPreviousSiblingId, oldParentNodeId, $tree) {

    var node = $tree.tree('getNodeById', nodeId);

    if (typeof oldPreviousSiblingId !== 'undefined') {
      var old_previous_sibling = $tree.tree('getNodeById', oldPreviousSiblingId);
      $tree.tree('moveNode', node, old_previous_sibling, 'after');
    }
    else if (typeof oldParentNodeId !== 'undefined') {
      var oldParentNode = $tree.tree('getNodeById', oldParentNodeId);
      $tree.tree('moveNode', node, oldParentNode, 'inside');
    }
    $tree.tree('updateNode', node, {moved: false});
  }

  function buildLink(url, label, additionalText) {
    var link = $('<a>').attr('href', url).addClass('tree-element-link').html(label);

    if (additionalText) {
      link = link.after(' ', additionalText);
    }
    return link;
  }

  function buildTeaserLink(node, link) {
    if (typeof node.glance_url === 'undefined') {
      return;
    }

    var teaserLink = $('<a/>')

    teaserLink.addClass('tree-element-teaser-link')
              .attr('href', node.glance_url)
              .append($('<i class="fa fa-search-plus"/>'))

    $(link).after(teaserLink);

    teaserLink.click(function(ev) {
      ev.preventDefault();

      var modal = $("#concept-teaser-modal");
      var target = $(this).attr("href");

      $.get(target, function(data) {
        modal.html(data);
        modal.modal();
      });
    });

    return teaserLink;
  }

}

return function(selector) {
  return new Treeview(selector);
};

}(jQuery));
