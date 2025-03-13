from setuptools import setup, find_packages

setup(
    name="audio-interpreter",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "openai>=1.59.8",
        "PyAudioWPatch>=0.2.12.7",
        "numpy>=1.24.0",
        "scipy>=1.10.0",
        "pydub>=0.25.1",
        "PyQt6>=6.5.0",
        "python-dotenv>=1.0.0",
    ],
    entry_points={
        "console_scripts": [
            "audio-interpreter=src.main:main",
        ],
    },
    author="AI Assistant",
    author_email="example@example.com",
    description="A tool that captures system audio and transcribes it using OpenAI's Whisper API",
    keywords="speech, audio, transcription, whisper, openai",
    python_requires=">=3.8",
) 