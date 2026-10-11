// The keyboard's menu is drawn by macOS in another process, which can only send each item's action NAME to the input controller.
// So every action must be a real method of that class, and the items must not point at some other object. (Compiled by test.sh.)
import AppKit
import InputMethodKit

var failed = 0
func check(_ cond: Bool, _ name: String) { print(cond ? "PASS" : "FAIL", name); if !cond { failed += 1 } }

let cls = FinglishInputController.self
let missing = FinglishInputController.toggles.filter { !cls.instancesRespond(to: $0.action) }.map { $0.title }
check(missing.isEmpty, "menu: every switch's action is a method of the input controller (missing: \(missing))")
check(cls.instancesRespond(to: NSSelectorFromString("showPreferences:")), "menu: the settings item uses the documented showPreferences: action")
check(Set(FinglishInputController.toggles.map { NSStringFromSelector($0.action) }).count == FinglishInputController.toggles.count, "menu: every switch has its own action")
check(FinglishInputController.toggles.allSatisfy { $0.title.range(of: "[\\u0600-\\u06FF]", options: .regularExpression) != nil }, "menu: every title is Persian")
check(!FinglishInputController.toggles.contains { $0.title.contains("۰") }, "menu: no title uses the digit ۰ (it looks like a dot) — the key is written صفر")
exit(failed == 0 ? 0 : 1)
