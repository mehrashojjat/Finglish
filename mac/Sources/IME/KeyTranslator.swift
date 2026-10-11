// NSEvent → Key (what the Session understands). Kept separate so it can be tested with synthetic events.
import Cocoa

enum KeyTranslator {
    /// nil = a key the keyboard does not handle (function keys, Home/End…): the caller commits any word and lets the key through.
    static func key(for e: NSEvent) -> Key? {
        switch e.keyCode {
        case 36, 76: return .enter            // Return, keypad Enter
        case 49: return e.modifierFlags.contains(.shift) ? .halfSpace : .space      // Shift+Space = half-space, as on a Persian keyboard
        case 51: return .backspace
        case 117: return .delete              // forward delete
        case 53: return .escape
        case 48: return e.modifierFlags.contains(.shift) ? .shiftTab : .tab
        case 126: return .up
        case 125: return .down
        case 123: return .left
        case 124: return .right
        case 116: return .pageUp
        case 121: return .pageDown
        default:
            guard let s = e.characters, s.count == 1, let ch = s.first, let u = ch.unicodeScalars.first else { return nil }
            if (0xF700...0xF8FF).contains(u.value) { return nil }       // private-use codes macOS gives to Home, End, F1…F20 …
            return .char(ch)
        }
    }
}
