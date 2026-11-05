"""Shared helpers for problem modules.

This file runs in two places with the SAME code:
  * at build time (python3 build.py) to validate solutions and pre-compute traces
  * inside the browser via Pyodide, so learners can edit code / inputs and re-run

Keep it dependency-free (stdlib only).
"""
from __future__ import annotations

import copy
import json
import traceback
from collections import deque
from typing import Any, Dict, List, Optional

# --------------------------------------------------------------------------
# LeetCode-style data structures
# --------------------------------------------------------------------------


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f"ListNode({self.val})"


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


class Node:
    """Used by Clone Graph (neighbors) and Copy List with Random Pointer (next/random)."""

    def __init__(self, val=0, neighbors=None, next=None, random=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
        self.next = next
        self.random = random

    def __repr__(self):
        return f"Node({self.val})"


# --------------------------------------------------------------------------
# Converters (list <-> structure)
# --------------------------------------------------------------------------


def list_to_linked(vals: Optional[List[Any]]) -> Optional[ListNode]:
    dummy = ListNode()
    cur = dummy
    for v in vals or []:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next


def linked_to_list(node: Optional[ListNode], limit: int = 10_000) -> List[Any]:
    out = []
    while node is not None and len(out) < limit:
        out.append(node.val)
        node = node.next
    return out


def list_to_tree(vals: Optional[List[Any]]) -> Optional[TreeNode]:
    """LeetCode level-order encoding with None for missing children."""
    if not vals or vals[0] is None:
        return None
    root = TreeNode(vals[0])
    q = deque([root])
    i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals) and vals[i] is not None:
            node.left = TreeNode(vals[i])
            q.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None:
            node.right = TreeNode(vals[i])
            q.append(node.right)
        i += 1
    return root


def tree_to_list(root: Optional[TreeNode]) -> List[Any]:
    if root is None:
        return []
    out: List[Any] = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(node.left)
        q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def adj_to_graph(adj: List[List[int]]) -> Optional[Node]:
    """LeetCode Clone Graph encoding: adj[i] = neighbors (1-indexed) of node i+1."""
    if not adj:
        return None
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, nbrs in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in nbrs]
    return nodes[0]


def graph_to_adj(node: Optional[Node]) -> List[List[int]]:
    if node is None:
        return []
    seen: Dict[int, Node] = {}
    q = deque([node])
    while q:
        cur = q.popleft()
        if cur.val in seen:
            continue
        seen[cur.val] = cur
        for n in cur.neighbors:
            if n.val not in seen:
                q.append(n)
    n = max(seen) if seen else 0
    return [sorted(x.val for x in seen[i].neighbors) if i in seen else [] for i in range(1, n + 1)]


def list_to_random_linked(pairs: List[List[Any]]) -> Optional[Node]:
    """LeetCode encoding [[val, random_index|None], ...]."""
    nodes = [Node(p[0]) for p in pairs]
    for i, p in enumerate(pairs):
        if i + 1 < len(nodes):
            nodes[i].next = nodes[i + 1]
        if p[1] is not None:
            nodes[i].random = nodes[p[1]]
    return nodes[0] if nodes else None


def random_linked_to_list(head: Optional[Node]) -> List[List[Any]]:
    nodes = []
    cur = head
    while cur is not None:
        nodes.append(cur)
        cur = cur.next
    index = {id(n): i for i, n in enumerate(nodes)}
    return [[n.val, index.get(id(n.random)) if n.random is not None else None] for n in nodes]


# --------------------------------------------------------------------------
# Tagged test values: tell the runner how to build / compare structures
# --------------------------------------------------------------------------


def tree(vals):
    return {"__tag__": "tree", "value": vals}


def linked(vals):
    return {"__tag__": "linked", "value": vals}


def graph(adj):
    return {"__tag__": "graph", "value": adj}


def random_linked(pairs):
    return {"__tag__": "random_linked", "value": pairs}


def unordered(value):
    """Expected value where order does not matter (list of items or list of lists)."""
    return {"__tag__": "unordered", "value": value}


def unordered_rows(value):
    """Expected list of lists where the OUTER order does not matter but each inner
    list must match exactly (e.g. points [x, y], intervals [start, end])."""
    return {"__tag__": "unordered_rows", "value": value}


def any_of(*values):
    """Expected value where several answers are acceptable."""
    return {"__tag__": "any_of", "value": list(values)}


def approx(value, eps=1e-5):
    return {"__tag__": "approx", "value": value, "eps": eps}


def _is_tag(v, name=None):
    return isinstance(v, dict) and "__tag__" in v and (name is None or v["__tag__"] == name)


def build_arg(v):
    """Convert tagged inputs into live structures (recursively for lists)."""
    if _is_tag(v, "tree"):
        return list_to_tree(v["value"])
    if _is_tag(v, "linked"):
        return list_to_linked(v["value"])
    if _is_tag(v, "graph"):
        return adj_to_graph(v["value"])
    if _is_tag(v, "random_linked"):
        return list_to_random_linked(v["value"])
    if isinstance(v, list):
        return [build_arg(x) for x in v]
    return v


def to_plain(v):
    """Convert live structures back into comparable plain data."""
    if isinstance(v, TreeNode):
        return tree_to_list(v)
    if isinstance(v, ListNode):
        return linked_to_list(v)
    if isinstance(v, Node):
        if v.neighbors or (v.next is None and v.random is None):
            return graph_to_adj(v)
        return random_linked_to_list(v)
    if isinstance(v, tuple):
        return [to_plain(x) for x in v]
    if isinstance(v, (set, frozenset)):
        return sorted(to_plain(x) for x in v)
    if isinstance(v, list):
        return [to_plain(x) for x in v]
    if isinstance(v, dict):
        return {str(k): to_plain(x) for k, x in v.items()}
    if isinstance(v, float) and v != v:  # NaN
        return "nan"
    return v


def _canon(v):
    """Canonical form for order-insensitive comparison."""
    return json.dumps(to_plain(v), sort_keys=True, default=str)


def matches(expected, actual) -> bool:
    if _is_tag(expected, "any_of"):
        return any(matches(e, actual) for e in expected["value"])
    if _is_tag(expected, "approx"):
        try:
            return abs(float(actual) - float(expected["value"])) <= expected.get("eps", 1e-5)
        except (TypeError, ValueError):
            return False
    if _is_tag(expected, "unordered_rows"):
        exp = to_plain(expected["value"])
        act = to_plain(actual)
        if not isinstance(act, list) or not isinstance(exp, list):
            return False
        return sorted(map(_canon, exp)) == sorted(map(_canon, act))
    if _is_tag(expected, "unordered"):
        exp = to_plain(expected["value"])
        act = to_plain(actual)
        if not isinstance(act, list) or not isinstance(exp, list):
            return False
        norm = lambda xs: sorted(  # noqa: E731
            _canon(sorted(x, key=_canon) if isinstance(x, list) else x) for x in xs)
        return norm(exp) == norm(act)
    structural = any(_is_tag(expected, k) for k in ("tree", "linked", "random_linked", "graph"))
    if _is_tag(expected):
        expected = expected["value"]
    exp = to_plain(expected)
    act = to_plain(actual)
    if structural and exp == [] and act is None:   # empty tree / list is returned as None
        return True
    if isinstance(exp, bool) or isinstance(act, bool):
        return exp is act or (exp == act and type(exp) == type(act))  # noqa: E721
    return exp == act


# --------------------------------------------------------------------------
# Test specs
# --------------------------------------------------------------------------


def T(args, expected, name=None, kwargs=None, check_arg=None, deep_copy=False):
    """A call test: Solution().<fn>(*args) == expected.
    check_arg=i: the method mutates its i-th argument in place; compare that argument
    (after the call) with `expected` instead of the return value.
    deep_copy=True: the returned structure must not share any node object with the
    inputs (Clone Graph, Copy List with Random Pointer)."""
    return {"kind": "call", "args": list(args), "kwargs": kwargs or {}, "expected": expected,
            "name": name, "check_arg": check_arg, "deep_copy": deep_copy}


def _collect_nodes(x, seen=None):
    """ids of all ListNode/TreeNode/Node objects reachable from x."""
    seen = set() if seen is None else seen
    stack = [x]
    while stack:
        v = stack.pop()
        if isinstance(v, (ListNode, TreeNode, Node)):
            if id(v) in seen:
                continue
            seen.add(id(v))
            for attr in ("next", "left", "right", "random"):
                child = getattr(v, attr, None)
                if child is not None:
                    stack.append(child)
            for nb in getattr(v, "neighbors", None) or []:
                stack.append(nb)
        elif isinstance(v, (list, tuple)):
            stack.extend(v)
    return seen


def _shares_nodes(result, inputs):
    out_ids = _collect_nodes(result)
    in_ids = _collect_nodes(list(inputs))
    return len(out_ids & in_ids)


def Ops(ops, expected, name=None):
    """A design-class test. ops[0] is the constructor: [ClassName, [ctor args]]; then
    [method, [args]] pairs. expected is the list of return values (None for void)."""
    return {"kind": "ops", "ops": ops, "expected": expected, "name": name}


SOLUTION_PRELUDE = """
from typing import List, Optional, Dict, Set, Tuple, Deque, Iterator, Any
from collections import defaultdict, Counter, deque, OrderedDict
import heapq, bisect, math, itertools, functools, random, string, re
from functools import lru_cache, cache, reduce
from _lib import ListNode, TreeNode, Node
"""


def _format_val(v):
    try:
        return json.dumps(to_plain(v), default=str)
    except Exception:
        return repr(v)


def run_tests(code: str, tests: List[dict], fn: Optional[str] = None,
              cls: Optional[str] = None) -> dict:
    """Exec `code`, then run every test. Returns {passed, total, results:[...]}.
    fn: method name on class Solution (call tests). cls: design class name (ops tests)."""
    ns: Dict[str, Any] = {}
    results = []
    try:
        exec(SOLUTION_PRELUDE + "\n" + code, ns)
    except Exception:
        return {"passed": 0, "total": len(tests), "error": traceback.format_exc(limit=3),
                "results": []}
    for i, t in enumerate(tests):
        label = t.get("name") or f"Test {i + 1}"
        try:
            if t["kind"] == "call":
                if fn is None:
                    raise RuntimeError("approach has no 'fn' (method name)")
                sol_cls = ns.get("Solution")
                if sol_cls is None:
                    raise RuntimeError("code must define `class Solution`")
                method = getattr(sol_cls(), fn)
                args = [build_arg(copy.deepcopy(a)) for a in t["args"]]
                kwargs = {k: build_arg(copy.deepcopy(v)) for k, v in t.get("kwargs", {}).items()}
                actual = method(*args, **kwargs)
                if t.get("check_arg") is not None:
                    actual = args[t["check_arg"]]       # in-place problems: inspect the argument
                ok = matches(t["expected"], actual)
                if ok and t.get("deep_copy") and actual is not None:
                    shared = _shares_nodes(actual, args)
                    if shared:
                        actual = f"returned structure shares node(s) with the input (not a deep copy): {shared}"
                        ok = False
                results.append({"name": label, "ok": ok, "input": _format_val(t["args"]),
                                "expected": _format_val(t["expected"]),
                                "actual": _format_val(actual)})
            else:
                ops = t["ops"]
                cname = cls or ops[0][0]
                klass = ns.get(cname)
                if klass is None:
                    raise RuntimeError(f"code must define `class {cname}`")
                obj = klass(*[build_arg(copy.deepcopy(a)) for a in ops[0][1]])
                outs = [None]
                for name, args in ops[1:]:
                    r = getattr(obj, name)(*[build_arg(copy.deepcopy(a)) for a in args])
                    outs.append(to_plain(r))
                exp = t["expected"]
                ok = len(exp) == len(outs) and all(matches(e, a) for e, a in zip(exp, outs))
                results.append({"name": label, "ok": ok, "input": _format_val(ops),
                                "expected": _format_val(exp), "actual": _format_val(outs)})
        except Exception:
            results.append({"name": label, "ok": False, "input": _format_val(t.get("args", t.get("ops"))),
                            "expected": _format_val(t["expected"]),
                            "actual": "raised:\n" + traceback.format_exc(limit=2)})
    passed = sum(1 for r in results if r["ok"])
    return {"passed": passed, "total": len(tests), "results": results}


# --------------------------------------------------------------------------
# Trace / visualiser views
# --------------------------------------------------------------------------
#
# A trace is a list of steps. Each step has a message (markdown-lite: `code`,
# **bold**) and a list of views. Views are rendered by site/assets/viz.js.
# Every view snapshots its data at call time (lists are copied), so mutating
# your variables afterwards is safe.

MAX_STEPS = 400


def _snap(v):
    """Deep copy + make JSON-friendly (tuples->lists, sets->sorted lists)."""
    if isinstance(v, (list, tuple)):
        return [_snap(x) for x in v]
    if isinstance(v, (set, frozenset)):
        try:
            return sorted(_snap(x) for x in v)
        except TypeError:
            return [_snap(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _snap(x) for k, x in v.items()}
    if isinstance(v, (TreeNode, ListNode, Node)):
        return str(v.val)
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return str(v)
        return round(v, 6)
    if v is None or isinstance(v, (bool, int, str)):
        return v
    return str(v)


def _idx_list(xs):
    if xs is None:
        return []
    if isinstance(xs, (int, str)):
        return [xs]
    return list(xs)


def _js_key(k):
    """Key string the renderer compares against: JS String() of the snapshotted value,
    so tuples (1, 2) -> "1,2", bools -> "true"/"false", None -> "null"."""
    k = _snap(k)
    if isinstance(k, list):
        return ",".join(_js_key(x) for x in k)
    if isinstance(k, bool):
        return "true" if k else "false"
    if k is None:
        return "null"
    return str(k)


def _marks(m):
    if not m:
        return {}
    return {_js_key(k): v for k, v in m.items()}


def array(name, values, pointers=None, highlight=None, marks=None, window=None, labels=None):
    """A 1-D array. pointers: {"i": 2, "j": 5}; highlight: [idx...];
    marks: {idx: "good"|"bad"|"active"|"visited"|"dim"|"target"}; window: (l, r) inclusive;
    labels: {idx: "text under the cell"}."""
    return {"type": "array", "name": name, "values": _snap(list(values)),
            "pointers": _snap(pointers or {}), "highlight": _idx_list(highlight),
            "marks": _marks(marks), "window": _snap(list(window)) if window else None,
            "labels": _marks(labels)}


def string(name, s, pointers=None, highlight=None, marks=None, window=None, labels=None):
    v = array(name, list(s), pointers, highlight, marks, window, labels)
    v["type"] = "string"
    return v


def hashmap(name, d, highlight=None, marks=None):
    """A dict. highlight: keys to light up. marks: {key: class}."""
    return {"type": "map", "name": name, "entries": [[_snap(k), _snap(v)] for k, v in d.items()],
            "highlight": [_js_key(k) for k in _idx_list(highlight)], "marks": _marks(marks)}


def hashset(name, s, highlight=None, marks=None):
    try:
        items = sorted(s)
    except TypeError:
        items = list(s)
    return {"type": "set", "name": name, "values": _snap(items),
            "highlight": [_js_key(k) for k in _idx_list(highlight)], "marks": _marks(marks)}


def stack(name, items, highlight=None, marks=None):
    """items[0] is the bottom, items[-1] the top."""
    return {"type": "stack", "name": name, "values": _snap(list(items)),
            "highlight": _idx_list(highlight), "marks": _marks(marks)}


def queue(name, items, highlight=None, marks=None):
    """items[0] is the front."""
    return {"type": "queue", "name": name, "values": _snap(list(items)),
            "highlight": _idx_list(highlight), "marks": _marks(marks)}


def heap(name, items, highlight=None, marks=None, kind="min"):
    """A binary heap stored as a list (heapq layout). Rendered as a tree + array."""
    return {"type": "heap", "name": name, "values": _snap(list(items)),
            "highlight": _idx_list(highlight), "marks": _marks(marks), "kind": kind}


def grid(name, rows, highlight=None, marks=None, row_labels=None, col_labels=None,
         pointers=None):
    """A 2-D table (matrix, DP table, board). highlight: [(r, c), ...];
    marks: {(r, c): class}; pointers: {"cur": (r, c)} draws a small label under that cell."""
    return {"type": "grid", "name": name, "rows": _snap([list(r) for r in rows]),
            "highlight": [list(x) for x in (highlight or [])],
            "marks": {f"{r},{c}": v for (r, c), v in (marks or {}).items()},
            "row_labels": _snap(list(row_labels)) if row_labels else None,
            "col_labels": _snap(list(col_labels)) if col_labels else None,
            "pointers": _snap(pointers or {})}


def linkedlist(name, values, pointers=None, highlight=None, marks=None, cycle_to=None,
               tail_text=None):
    """values in link order. pointers: {"prev": 0, "cur": 1} (index or None for null).
    cycle_to: index the last node links back to. tail_text: label after the last node."""
    return {"type": "linkedlist", "name": name, "values": _snap(list(values)),
            "pointers": _snap(pointers or {}), "highlight": _idx_list(highlight),
            "marks": _marks(marks), "cycle_to": cycle_to, "tail_text": tail_text}


def linked_view(name, head, pointers=None, highlight=None, marks=None, limit=30):
    """Convenience: build a linkedlist view from live ListNodes. pointers map label ->
    node (or None). Indices are resolved by identity along the chain from head."""
    nodes = []
    cur = head
    seen = set()
    cycle_to = None
    while cur is not None and len(nodes) < limit:
        if id(cur) in seen:
            cycle_to = [id(n) for n in nodes].index(id(cur))
            break
        seen.add(id(cur))
        nodes.append(cur)
        cur = cur.next
    ids = [id(n) for n in nodes]
    ptrs = {}
    for label, node in (pointers or {}).items():
        ptrs[label] = ids.index(id(node)) if node is not None and id(node) in ids else None
    return linkedlist(name, [n.val for n in nodes], ptrs, highlight, marks, cycle_to)


def tree_view(name, root, highlight=None, marks=None, labels=None):
    """Binary tree from live TreeNodes. highlight/marks/labels are keyed by node *id*
    (use node_id(node)) or by the node object itself."""
    nodes = []
    index = {}

    def key(x):
        return x if isinstance(x, (int, str)) else node_id(x)

    def walk(n):
        if n is None:
            return None
        nid = node_id(n)
        index[nid] = len(nodes)
        nodes.append({"id": nid, "val": _snap(n.val), "left": None, "right": None})
        me = nodes[-1]
        me["left"] = walk(n.left)
        me["right"] = walk(n.right)
        return nid

    walk(root)
    return {"type": "tree", "name": name, "nodes": nodes,
            "highlight": [key(x) for x in _idx_list(highlight)],
            "marks": {str(key(k)): v for k, v in (marks or {}).items()},
            "labels": {str(key(k)): _snap(v) for k, v in (labels or {}).items()}}


def tree_nodes(name, nodes, highlight=None, marks=None, labels=None):
    """Tree from explicit dicts: [{"id": .., "val": .., "left": id|None, "right": id|None}]
    (nodes[0] is the root). Useful for tries / N-ary trees drawn as binary."""
    return {"type": "tree", "name": name, "nodes": _snap(nodes),
            "highlight": _idx_list(highlight), "marks": _marks(marks), "labels": _marks(labels)}


def node_id(n):
    return str(id(n) % 100003)


def graph_view(name, nodes, edges, directed=False, highlight=None, marks=None,
               highlight_edges=None, labels=None, pos=None):
    """nodes: list of ids (ints/strs) or dicts {"id", "label"}; edges: [a, b] or [a, b, w].
    marks: {node: class}; labels: {node: small text}; pos: {node: (x, y)} in 0..1."""
    ns = [n if isinstance(n, dict) else {"id": _snap(n), "label": str(n)} for n in nodes]
    return {"type": "graph", "name": name, "nodes": _snap(ns), "edges": _snap([list(e) for e in edges]),
            "directed": directed, "highlight": [_snap(x) for x in _idx_list(highlight)],
            "marks": _marks(marks), "highlight_edges": _snap([list(e) for e in (highlight_edges or [])]),
            "labels": _marks({k: _snap(v) for k, v in (labels or {}).items()}),
            "pos": {str(k): list(v) for k, v in (pos or {}).items()} if pos else None}


def intervals(name, items, highlight=None, marks=None, labels=None, extra=None):
    """items: [[start, end], ...]. extra: {"name": [start, end]} drawn as a separate bar."""
    return {"type": "intervals", "name": name, "items": _snap([list(x) for x in items]),
            "highlight": _idx_list(highlight), "marks": _marks(marks), "labels": _marks(labels),
            "extra": _snap(extra or {})}


def bars(name, values, pointers=None, highlight=None, marks=None, labels=None, window=None,
         water=None, fill=None, levels=None, index_from=0, base=None):
    """A bar chart (histogram): each value is a vertical bar with its index underneath.
    Use it whenever the numbers ARE heights/amounts (walls, water, prices, temperatures, piles).
    pointers: {"L": 0, "R": 8} shown under the bars; highlight: [idx...];
    marks: {idx: "good"|"bad"|"active"|"dim"|"target"|"wall"|"visited"};
    labels: {idx: "text above the bar"}; window: (l, r) inclusive, shaded behind the bars;
    water: [w0, w1, ...] units of water sitting on top of each bar (None/0 = none);
    fill: [dict(lo=i, hi=j, level=h, label="7 x 7 = 49", kind="between"|"cover")]
          'between' (default) fills from the centre of bar lo to the centre of bar hi, as water held
          between two lines; 'cover' fills the full width of bars lo..hi, as a rectangle under them;
    levels: [dict(y=h, label="left_max = 8")] dashed horizontal reference lines;
    base: start the axis at this value instead of 0 (temperatures 69..76 would otherwise look equal);
          the chart says so, and water/fill/levels stay in real units."""
    fills = []
    for f in fill or []:
        f = dict(f)
        fills.append({"lo": int(f["lo"]), "hi": int(f["hi"]), "level": _snap(f.get("level", 0)),
                      "label": str(f["label"]) if f.get("label") is not None else None,
                      "kind": f.get("kind", "between")})
    lv = [{"y": _snap(x["y"]), "label": str(x.get("label", ""))} for x in (levels or [])]
    return {"type": "bars", "name": name, "values": _snap(list(values)),
            "pointers": _snap(pointers or {}), "highlight": _idx_list(highlight),
            "marks": _marks(marks), "labels": _marks(labels),
            "window": _snap(list(window)) if window else None,
            "water": _snap([None if w in (None, "·") else w for w in water]) if water else None,
            "fill": fills, "levels": lv, "index_from": int(index_from),
            "base": _snap(base) if base is not None else None}


def bits(name, value, width=8, highlight=None, marks=None):
    """An integer shown in binary (two's complement for negatives). highlight: bit positions
    counted from the right (0 = least significant)."""
    v = int(value) & ((1 << width) - 1)
    return {"type": "bits", "name": name, "bits": format(v, f"0{width}b"), "value": int(value),
            "highlight": _idx_list(highlight), "marks": _marks(marks)}


def callstack(name, frames, highlight=None):
    """Recursion frames as strings, outermost first, e.g. ["dfs(0, [])", "dfs(1, [1])"]."""
    return {"type": "callstack", "name": name, "frames": [str(f) for f in frames],
            "highlight": _idx_list(highlight)}


SYSTEM_KINDS = ("client", "lb", "gateway", "server", "service", "db", "cache", "queue", "cdn",
                "storage", "worker", "dns", "search", "external", "box")


def system(name, nodes, edges, highlight=None, marks=None, labels=None, active_edges=None,
           pos=None, counters=None):
    """An architecture / component diagram drawn as boxes and arrows. For concept chapters
    (load balancers, caches, queues, replication, request flows).

    nodes: list of dicts {"id": "lb", "label": "Load balancer", "kind": "lb", "sub": "round robin"}
           or plain ids. kind picks an icon: client, lb, gateway, server, service, db, cache, queue,
           cdn, storage, worker, dns, search, external, box (default).
    edges: [frm, to] or [frm, to, "label"] (always drawn as arrows frm -> to).
    highlight: node ids lit up; marks: {id: "good"|"bad"|"active"|"dim"|"visited"|"target"};
    labels: {id: "small text under the box"} e.g. {"s1": "load 3"};
    active_edges: [[frm, to], ...] drawn thick/coloured (the path a request takes);
    pos: {id: (col, row)} grid cells (0-based ints). Without pos, nodes are layered left to
         right by edge order (sources first) — pass pos when the layout matters.
    counters: {id: number} shown as a badge on the box (requests served, queue depth, hits)."""
    ns = []
    for n_ in nodes:
        if isinstance(n_, dict):
            d = dict(n_)
            d["id"] = str(d["id"])
            d.setdefault("label", d["id"])
            d["kind"] = d.get("kind", "box")
            if d["kind"] not in SYSTEM_KINDS:
                d["kind"] = "box"
            ns.append(_snap(d))
        else:
            ns.append({"id": str(n_), "label": str(n_), "kind": "box"})
    es = []
    for e in edges:
        e = list(e)
        row = [str(e[0]), str(e[1])]
        if len(e) > 2 and e[2] is not None:
            row.append(str(e[2]))
        es.append(row)
    return {"type": "system", "name": name, "nodes": ns, "edges": es,
            "highlight": [str(x) for x in _idx_list(highlight)], "marks": _marks(marks),
            "labels": {str(k): _snap(v) for k, v in (labels or {}).items()},
            "active_edges": [[str(a), str(b)] for a, b in (active_edges or [])],
            "pos": {str(k): [int(v[0]), int(v[1])] for k, v in (pos or {}).items()} if pos else None,
            "counters": {str(k): _snap(v) for k, v in (counters or {}).items()}}


def lanes(name, lanes, events, now=None, arrows=None, end=None, highlight=None, unit=None):
    """Swimlanes over time: threads interleaving, protocol messages, CPU schedules, transactions.

    lanes: ["Thread A", "Thread B", "counter"] (top to bottom).
    events: [dict(lane=0, t=0, text="read x = 0", kind="good"|"bad"|"active"|"dim"|"wait"|"visited",
                  dur=2)]  — a box on that lane starting at time t; dur (default 1) is its width.
            lane may be the index or the lane's name.
    now: current time; a vertical cursor is drawn there and later events are faded.
    arrows: [dict(frm=(lane, t), to=(lane, t), text="SYN")] — messages between lanes (sequence
            diagram style). Lanes may be indices or names.
    end: last time unit on the axis (defaults to the latest event end).
    highlight: indices into events to light up.
    unit: axis label, e.g. "ms" or "tick"."""
    names = [str(x) for x in lanes]

    def lane_idx(x):
        if isinstance(x, int):
            return x
        return names.index(str(x))

    evs = []
    for e in events:
        e = dict(e)
        evs.append({"lane": lane_idx(e["lane"]), "t": _snap(e.get("t", 0)), "dur": _snap(e.get("dur", 1)),
                    "text": str(e.get("text", "")), "kind": e.get("kind", "")})
    ars = []
    for a in arrows or []:
        a = dict(a)
        ars.append({"frm": [lane_idx(a["frm"][0]), _snap(a["frm"][1])],
                    "to": [lane_idx(a["to"][0]), _snap(a["to"][1])],
                    "text": str(a.get("text", "")), "kind": a.get("kind", "")})
    last = 0
    for e in evs:
        last = max(last, (e["t"] or 0) + (e["dur"] or 0))
    for a in ars:
        last = max(last, a["frm"][1] or 0, a["to"][1] or 0)
    return {"type": "lanes", "name": name, "lanes": names, "events": evs, "arrows": ars,
            "now": _snap(now) if now is not None else None,
            "end": _snap(end) if end is not None else last,
            "highlight": _idx_list(highlight), "unit": unit}


def vars(**kw):
    """Scalar variables shown as chips. Values are stringified when not JSON-friendly."""
    return {"type": "vars", "entries": [[k, _snap(v)] for k, v in kw.items()]}


def result(value, label="result", kind="good"):
    """The outcome chip. kind: good (default, green) | bad | warn | info."""
    return {"type": "result", "label": label, "value": _snap(value), "kind": kind}


def note(text, kind="info"):
    """A callout inside a step. kind: info | good | bad | warn."""
    return {"type": "note", "text": str(text), "kind": kind}


class Trace:
    """Collects steps. Usage:
        t = Trace()
        t.step("Look at nums[i]", array("nums", nums, pointers={"i": i}), vars(i=i))
        return t
    A trace function must return the Trace (or t.steps)."""

    def __init__(self):
        self.steps: List[dict] = []
        self.truncated = False

    def step(self, msg, *views, line=None):
        if len(self.steps) >= MAX_STEPS:
            self.truncated = True
            return
        flat = []
        for v in views:
            if v is None:
                continue
            if isinstance(v, list):
                flat.extend(x for x in v if x)
            else:
                flat.append(v)
        s = {"msg": str(msg), "views": flat}
        if line is not None:
            s["line"] = int(line)
        self.steps.append(s)

    def to_json(self):
        return {"steps": self.steps, "truncated": self.truncated}


def trace_to_json(t) -> dict:
    if isinstance(t, Trace):
        return t.to_json()
    if isinstance(t, list):
        return {"steps": t, "truncated": False}
    raise TypeError("trace function must return a Trace or a list of steps")


# --------------------------------------------------------------------------
# Preferred (capitalised) names for the view helpers. Lower-case names like
# `stack` or `grid` are natural variable names and get shadowed; use these.
# --------------------------------------------------------------------------
Array = array
Str = string
HashMap = hashmap
HashSet = hashset
Stack = stack
Queue = queue
Heap = heap
Grid = grid
LinkedList = linkedlist      # from a plain list of values
Linked = linked_view         # from live ListNodes
Tree = tree_view             # from live TreeNodes
TreeNodes = tree_nodes       # from explicit node dicts
Graph = graph_view
Intervals = intervals
Bars = bars
Bits = bits
CallStack = callstack
System = system              # boxes + arrows architecture view (concept chapters)
Lanes = lanes                # swimlane timeline (threads, protocols, schedules)
Vars = vars
Result = result
Note = note

__all__ = [
    "ListNode", "TreeNode", "Node",
    "list_to_linked", "linked_to_list", "list_to_tree", "tree_to_list", "adj_to_graph", "graph_to_adj",
    "list_to_random_linked", "random_linked_to_list",
    "tree", "linked", "graph", "random_linked", "unordered", "unordered_rows", "any_of", "approx", "T", "Ops",
    "run_tests", "matches", "build_arg", "to_plain",
    "Trace", "trace_to_json", "node_id", "MAX_STEPS",
    "Array", "Str", "HashMap", "HashSet", "Stack", "Queue", "Heap", "Grid", "LinkedList", "Linked",
    "Tree", "TreeNodes", "Graph", "Intervals", "Bars", "Bits", "CallStack", "System", "Lanes",
    "Vars", "Result", "Note",
    # lower-case originals still exported for convenience
    "array", "string", "hashmap", "hashset", "stack", "queue", "heap", "grid", "linkedlist", "linked_view",
    "tree_view", "tree_nodes", "graph_view", "intervals", "bars", "bits", "callstack", "system", "lanes",
    "vars", "result", "note",
]
