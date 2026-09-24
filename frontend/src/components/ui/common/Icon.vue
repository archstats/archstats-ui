<template>
  <component :is="iconComponent" :size="props.size" :stroke-width="1.75" aria-hidden="true"></component>
</template>

<script setup lang="ts">
import {computed} from "vue";


import {
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreVertical,
  RotateCcw,
  Footprints,
  Pencil,
  ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ArrowRightFromLine, Check, ArrowRight, ArrowLeft, Recycle, Search, SearchCode, Undo2, Redo2, FlaskConical, Heading, List, ListOrdered, TextQuote, Code, RefreshCw as RefreshCwIcon, Terminal as TerminalIcon, GripVertical, FileDown,
  Settings2, PanelRight, PanelRightClose, Filter, Maximize2, Minimize2, ZoomIn, ZoomOut, Plus, Minus, Trash2, FolderOpen,
  Layers, Network, GitBranch, Table2, Eye, EyeOff, Focus, Boxes, Milestone, HelpCircle, AlertTriangle, Bookmark, Download,
  Copy, ArrowUpRight, FileText, FileCode2, History, User, Users, GitCommit, Link2, ExternalLink, ListTree, Flame, Scale, RefreshCw, Component, Folder, Braces, Workflow, Image as ImageIcon, MoreHorizontal
} from 'lucide-vue-next';

const props = defineProps(
    {
      icon: String,
      size: {
        type: Number,
        default: 18
      }
    }
)

const iconComponent = computed(() => {
  switch (props.icon) {
    case "recycle":
      return Recycle
    case "info":
      return Info
    case "chevron-down":
      return ChevronDown
    case "chevron-up":
      return ChevronUp
    case "chevron-right":
      return ChevronRight
    case "chevron-left":
      return ChevronLeft
    case "more-vertical":
      return MoreVertical
    case "rotate":
      return RotateCcw
    case "footprints":
      return Footprints
    case "pencil":
      return Pencil
    case "arrow-left-to-line":
      return ArrowLeftToLine
    case "arrow-right-to-line":
      return ArrowRightToLine
    case "arrow-right-from-line":
      return ArrowRightFromLine
    case "check":
      return Check
    case "arrow-right":
      return ArrowRight
    case "arrow-left":
      return ArrowLeft
    case "x":
      return X
    case "heading":
      return Heading;
    case "list":
      return List;
    case "list-ordered":
      return ListOrdered;
    case "quote":
      return TextQuote;
    case "code":
      return Code;
    case "refresh-cw":
      return RefreshCwIcon;
    case "terminal":
      return TerminalIcon;
    case "grip":
      return GripVertical;
    case "file-down":
      return FileDown;
    case "undo":
      return Undo2;
    case "redo":
      return Redo2;
    case "flask":
      return FlaskConical;
    case "search-code":
      return SearchCode;
    case "search":
      return Search
    case "settings":
      return Settings2
    case "panel-right":
      return PanelRight
    case "panel-right-close":
      return PanelRightClose
    case "filter":
      return Filter
    case "maximize":
      return Maximize2
    case "minimize":
      return Minimize2
    case "zoom-in":
      return ZoomIn
    case "zoom-out":
      return ZoomOut
    case "plus":
      return Plus
    case "minus":
      return Minus
    case "trash":
      return Trash2
    case "folder":
      return FolderOpen
    case "layers":
      return Layers
    case "network":
      return Network
    case "git-branch":
      return GitBranch
    case "table":
      return Table2
    case "eye":
      return Eye
    case "eye-off":
      return EyeOff
    case "focus":
      return Focus
    case "boxes":
      return Boxes
    case "route":
      return Milestone
    case "help":
      return HelpCircle
    case "alert":
      return AlertTriangle
    case "bookmark":
      return Bookmark
    case "copy":
      return Copy
    case "arrow-up-right":
      return ArrowUpRight
    case "file-text":
      return FileText
    case "file-code":
      return FileCode2
    case "history":
      return History
    case "user":
      return User
    case "users":
      return Users
    case "git-commit":
      return GitCommit
    case "link":
      return Link2
    case "external-link":
      return ExternalLink
    case "list-tree":
      return ListTree
    case "flame":
      return Flame
    case "scale":
      return Scale
    case "refresh":
      return RefreshCw
    case "component":
      return Component
    case "folder-closed":
      return Folder
    case "braces":
      return Braces
    case "waypoints":
      return Workflow
    case "image":
      return ImageIcon
    case "more-horizontal":
      return MoreHorizontal
    case "download":
      return Download
  }
})


</script>

<style scoped>

</style>