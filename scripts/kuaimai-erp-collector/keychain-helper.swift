import Foundation
import Security

guard CommandLine.arguments.count == 3 else {
  FileHandle.standardError.write(Data("Keychain helper requires service and account.\n".utf8))
  exit(64)
}

let service = CommandLine.arguments[1]
let account = CommandLine.arguments[2]
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let token = String(data: input, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !token.isEmpty else {
  FileHandle.standardError.write(Data("Keychain token is empty.\n".utf8))
  exit(65)
}

let identity: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account
]
let deleteStatus = SecItemDelete(identity as CFDictionary)
guard deleteStatus == errSecSuccess || deleteStatus == errSecItemNotFound else {
  FileHandle.standardError.write(Data("Unable to replace Keychain item (OSStatus \(deleteStatus)).\n".utf8))
  exit(66)
}

var item = identity
item[kSecValueData as String] = Data(token.utf8)
let addStatus = SecItemAdd(item as CFDictionary, nil)
guard addStatus == errSecSuccess else {
  FileHandle.standardError.write(Data("Unable to store Keychain item (OSStatus \(addStatus)).\n".utf8))
  exit(67)
}
