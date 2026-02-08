from hunyuan_service import convert3d_from_image_file

class DummyFile:
    def __init__(self, path):
        self.f = open(path, "rb")

    def read(self):
        return self.f.read()

file = DummyFile("test.jpg")

output = convert3d_from_image_file(file)
print("✅ OUTPUT:", output)
